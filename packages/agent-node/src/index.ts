import { EventEmitter } from "node:events";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify } from "@libp2p/identify";
import { kadDHT } from "@libp2p/kad-dht";
import { ping } from "@libp2p/ping";
import { tcp } from "@libp2p/tcp";
import { createLibp2p } from "libp2p";
import { BridgeRegistry } from "@ffp/bridges";
import { ConsensusEngine } from "@ffp/consensus";
import { AgentIdentity, ProtocolCore, createProposal, type FinalizationBroadcast } from "@ffp/protocol-core";
import {
  PROTOCOL_TOPIC,
  SignedEnvelopeSchema,
  type AgentRecord,
  type BridgeExecutionReport,
  type BridgeRequest,
  type ConsensusResult,
  type MessageKind,
  type Proposal,
  type ProposalResolution,
  type ProposalSubmission,
  type ProtocolFeeEvent,
  type ProtocolSnapshot,
  type Vote,
  assertConsensusResult,
  hashValue,
  makeDeterministicId,
  nowIso
} from "@ffp/shared-types";
import { FurgeFeeLedger, estimateBridgeFee } from "@ffp/tokenomics";

export type DeterministicEvaluator = (proposal: Proposal, agent: AgentRecord) => Pick<Vote, "decision" | "confidence" | "reason">;

type PubsubMessageEvent = { detail: { data: Uint8Array } };
type PubsubService = {
  subscribe(topic: string): Promise<void>;
  publish(topic: string, payload: Uint8Array): Promise<void>;
  addEventListener(type: "message", listener: (event: PubsubMessageEvent) => void): void;
};
type Libp2pLike = {
  start(): Promise<void>;
  stop(): Promise<void>;
  dial(address: string): Promise<void>;
  getMultiaddrs(): unknown[];
  peerId?: { toString(): string };
  services: { pubsub: PubsubService };
};

export type AgentNodeOptions = {
  identity: AgentIdentity;
  seedAgents: AgentRecord[];
  listenAddresses: string[];
  bootstrapAddresses?: string[];
  topic?: string;
  consensusEngine?: ConsensusEngine;
  bridgeRegistry?: BridgeRegistry;
  feeLedger?: FurgeFeeLedger;
  evaluator?: DeterministicEvaluator;
};

export type BridgeBroadcastPayload = {
  report: BridgeExecutionReport;
  feeEvent: ProtocolFeeEvent;
};

export class AgentNode extends EventEmitter {
  readonly identity: AgentIdentity;
  readonly core: ProtocolCore;
  readonly consensusEngine: ConsensusEngine;
  readonly bridgeRegistry: BridgeRegistry;
  readonly feeLedger: FurgeFeeLedger;
  readonly topic: string;

  private readonly bootstrapAddresses: string[];
  private readonly listenAddresses: string[];
  private readonly evaluator: DeterministicEvaluator;
  private libp2p?: Libp2pLike;
  private started = false;
  private readonly pendingResolutions = new Map<string, { resolve: (value: ProposalResolution) => void; reject: (reason?: unknown) => void }>();
  private readonly bridgeArtifacts: BridgeExecutionReport[] = [];

  constructor(options: AgentNodeOptions) {
    super();
    this.identity = options.identity;
    this.topic = options.topic ?? PROTOCOL_TOPIC;
    this.bootstrapAddresses = options.bootstrapAddresses ?? [];
    this.listenAddresses = options.listenAddresses;
    this.consensusEngine = options.consensusEngine ?? new ConsensusEngine();
    this.bridgeRegistry = options.bridgeRegistry ?? new BridgeRegistry();
    this.feeLedger = options.feeLedger ?? new FurgeFeeLedger();
    this.evaluator = options.evaluator ?? defaultDeterministicEvaluator;
    this.core = new ProtocolCore(options.seedAgents);
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.libp2p = (await createLibp2p({
      addresses: {
        listen: this.listenAddresses
      },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {
        identify: identify(),
        pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }),
        ping: ping(),
        dht: kadDHT()
      }
    } as never)) as unknown as Libp2pLike;

    await this.libp2p.start();
    await this.libp2p.services.pubsub.subscribe(this.topic);
    this.libp2p.services.pubsub.addEventListener("message", (event: PubsubMessageEvent) => {
      void this.handleRawMessage(event.detail.data);
    });

    for (const address of this.bootstrapAddresses) {
      await this.safeDial(address);
    }

    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started || !this.libp2p) {
      return;
    }

    await this.libp2p.stop();
    this.started = false;
  }

  async joinNetwork(addresses: string[]): Promise<void> {
    for (const address of addresses) {
      await this.safeDial(address);
    }
  }

  getPeerMetadata(): { agentId: string; peerId: string; listenAddresses: string[] } {
    return {
      agentId: this.identity.agentId,
      peerId: this.libp2p?.peerId?.toString() ?? "offline",
      listenAddresses: (this.libp2p?.getMultiaddrs() ?? []).map((address: unknown) => String(address))
    };
  }

  async submitProposal(input: ProposalSubmission): Promise<ProposalResolution> {
    const proposal = createProposal({
      proposerId: this.identity.agentId,
      subject: input.subject,
      summary: input.summary,
      payload: input.payload,
      tags: input.tags,
      expiresInMs: input.expiresInMs
    });
    this.core.submitProposal(proposal);
    await this.publishEnvelope("proposal", proposal);

    const localVote = this.buildVote(proposal);
    this.core.recordVote(localVote);
    await this.publishEnvelope("vote", localVote);
    await this.tryFinalize(proposal.proposalId);

    return await new Promise<ProposalResolution>((resolve, reject) => {
      this.pendingResolutions.set(proposal.proposalId, { resolve, reject });
      setTimeout(() => {
        if (this.pendingResolutions.has(proposal.proposalId)) {
          this.pendingResolutions.delete(proposal.proposalId);
          reject(new Error(`Proposal ${proposal.proposalId} did not finalize before local wait expired`));
        }
      }, input.expiresInMs ?? 8_000);
    });
  }

  async executeBridge(request: Omit<BridgeRequest, "requestId" | "createdAt">, consensus: ConsensusResult): Promise<BridgeBroadcastPayload> {
    const bridgeRequest: BridgeRequest = {
      requestId: makeDeterministicId("bridge-request", `${request.adapterId}:${request.operation}:${nowIso()}`),
      adapterId: request.adapterId,
      operation: request.operation,
      payload: request.payload,
      requestedBy: request.requestedBy,
      createdAt: nowIso()
    };

    const report = await this.bridgeRegistry.executeWithConsensus(bridgeRequest, consensus);
    const feeAmount = estimateBridgeFee(JSON.stringify(bridgeRequest.payload).length, this.core.listAgents().length);
    const feeEvent = this.feeLedger.recordBridgeFee({
      payerId: bridgeRequest.requestedBy,
      referenceId: report.runId,
      amount: feeAmount,
      payeeId: this.identity.agentId
    });

    this.bridgeArtifacts.push(report);
    await this.publishEnvelope("bridge", { report, feeEvent } satisfies BridgeBroadcastPayload);
    return { report, feeEvent };
  }

  getSnapshot(allPeers: Array<{ agentId: string; peerId: string; listenAddresses: string[] }>): ProtocolSnapshot {
    const tokenState = this.feeLedger.exportState();
    return {
      startedAt: nowIso(),
      agents: this.core.listAgents(),
      proposals: this.core.listProposals(),
      blocks: this.core.immutableChain.listBlocks(),
      reputationEvents: this.core.reputationLedger.listEvents(),
      bridgeReports: this.bridgeArtifacts.length > 0 ? [...this.bridgeArtifacts] : this.bridgeRegistry.listReports(),
      feeEvents: tokenState.feeEvents,
      tokenAccounts: tokenState.accounts,
      tokenEvents: tokenState.tokenEvents,
      tokenSupply: tokenState.supply,
      auditTrail: this.core.listAuditTrail(),
      peers: allPeers
    };
  }

  private async publishEnvelope<T>(kind: MessageKind, payload: T): Promise<void> {
    if (!this.libp2p) {
      throw new Error("Libp2p node is not started");
    }

    const envelope = this.identity.signEnvelope(kind, payload);
    const encoded = new TextEncoder().encode(JSON.stringify(envelope));
    await this.libp2p.services.pubsub.publish(this.topic, encoded);
  }

  private async handleRawMessage(raw: Uint8Array): Promise<void> {
    const parsed = JSON.parse(new TextDecoder().decode(raw));
    const envelope = SignedEnvelopeSchema.parse(parsed);
    if (!AgentIdentity.verifyEnvelope(envelope)) {
      return;
    }

    switch (envelope.kind) {
      case "proposal":
        await this.handleProposalEnvelope(envelope.payload as Proposal, envelope.signerId);
        break;
      case "vote":
        await this.handleVoteEnvelope(envelope.payload as Vote);
        break;
      case "block":
        this.handleBlockEnvelope(envelope.payload as FinalizationBroadcast);
        break;
      case "bridge":
        this.handleBridgeEnvelope(envelope.payload as BridgeBroadcastPayload);
        break;
      default:
        break;
    }
  }

  private async handleProposalEnvelope(proposal: Proposal, signerId: string): Promise<void> {
    if (this.core.hasProposal(proposal.proposalId)) {
      return;
    }

    this.core.submitProposal(proposal);
    if (signerId === this.identity.agentId) {
      return;
    }

    const vote = this.buildVote(proposal);
    this.core.recordVote(vote);
    await this.publishEnvelope("vote", vote);
  }

  private async handleVoteEnvelope(vote: Vote): Promise<void> {
    if (!this.core.hasProposal(vote.proposalId)) {
      return;
    }

    this.core.recordVote(vote);
    await this.tryFinalize(vote.proposalId);
  }

  private handleBlockEnvelope(broadcast: FinalizationBroadcast): void {
    this.core.applyFinalizationBroadcast(broadcast);
    const result = broadcast.block.result as ConsensusResult;
    const resolution = this.buildResolution(result.proposalId);
    this.emit("proposal-finalized", resolution);
    const pending = this.pendingResolutions.get(result.proposalId);
    if (pending) {
      pending.resolve(resolution);
      this.pendingResolutions.delete(result.proposalId);
    }
  }

  private handleBridgeEnvelope(payload: BridgeBroadcastPayload): void {
    this.bridgeRegistry.importReport(payload.report);
    this.feeLedger.importEvent(payload.feeEvent);
    this.bridgeArtifacts.push(payload.report);
  }

  private async tryFinalize(proposalId: string): Promise<void> {
    const proposal = this.core.getProposal(proposalId);
    if (proposal.proposerId !== this.identity.agentId || this.core.isFinalized(proposalId)) {
      return;
    }

    const progress = this.consensusEngine.evaluateProposal(proposal, this.core.listVotes(proposalId), this.core.listAgentIds(), this.core.reputationLedger);
    if (progress.status === "pending") {
      return;
    }

    assertConsensusResult(progress);
    const broadcast = this.core.finalizeProposal(progress);
    const resolution = this.buildResolution(proposalId);
    this.emit("proposal-finalized", resolution);
    await this.publishEnvelope("block", broadcast);

    const pending = this.pendingResolutions.get(proposalId);
    if (pending) {
      pending.resolve(resolution);
      this.pendingResolutions.delete(proposalId);
    }
  }

  private buildResolution(proposalId: string): ProposalResolution {
    const proposal = this.core.getProposal(proposalId);
    const result = this.core.getResult(proposalId);
    const block = this.core.immutableChain.getByProposal(proposalId);
    if (!result || !block) {
      throw new Error(`Proposal ${proposalId} is not finalized locally`);
    }

    return {
      proposal,
      result,
      votes: this.core.listVotes(proposalId),
      block
    };
  }

  private buildVote(proposal: Proposal): Vote {
    const agent = this.core.getAgent(this.identity.agentId);
    const evaluation = this.evaluator(proposal, agent);
    return {
      proposalId: proposal.proposalId,
      voterId: this.identity.agentId,
      decision: evaluation.decision,
      confidence: evaluation.confidence,
      reason: evaluation.reason,
      createdAt: nowIso()
    };
  }

  private async safeDial(address: string): Promise<void> {
    if (!this.libp2p || !address) {
      return;
    }

    try {
      await this.libp2p.dial(address);
    } catch {
      this.emit("peer-dial-failed", address);
    }
  }
}

export function defaultDeterministicEvaluator(proposal: Proposal, agent: AgentRecord): Pick<Vote, "decision" | "confidence" | "reason"> {
  const seed = hashValue({ proposalId: proposal.proposalId, subject: proposal.subject, tags: proposal.tags, label: agent.label });
  const signal = parseInt(seed.slice(0, 8), 16) / 0xffffffff;
  const capabilityBoost = proposal.tags.filter((tag) => agent.capabilities.includes(normalizeTag(tag))).length * 0.08;
  const supportScore = Math.max(0.05, Math.min(0.95, 0.34 + signal * 0.42 + capabilityBoost));

  if (supportScore >= 0.6) {
    return {
      decision: "support",
      confidence: Number(supportScore.toFixed(3)),
      reason: `${agent.label} observed sufficient alignment between the proposal tags and its protocol specialization.`
    };
  }

  if (supportScore <= 0.4) {
    return {
      decision: "reject",
      confidence: Number((1 - supportScore).toFixed(3)),
      reason: `${agent.label} identified a consensus risk signal that kept the proposal below its support threshold.`
    };
  }

  return {
    decision: "abstain",
    confidence: 0.5,
    reason: `${agent.label} abstained because the deterministic evaluation signal stayed near the protocol midpoint.`
  };
}

function normalizeTag(tag: string): AgentRecord["capabilities"][number] {
  if (tag.includes("bridge")) {
    return "bridge";
  }
  if (tag.includes("audit")) {
    return "audit";
  }
  if (tag.includes("network")) {
    return "network";
  }
  if (tag.includes("observe")) {
    return "observability";
  }
  if (tag.includes("coordinate")) {
    return "coordination";
  }
  return "consensus";
}

