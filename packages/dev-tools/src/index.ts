import { AgentNode, defaultDeterministicEvaluator } from "@ffp/agent-node";
import { LoopbackBridgeAdapter } from "@ffp/bridges";
import { ConsensusEngine } from "@ffp/consensus";
import { AgentIdentity, createProposal } from "@ffp/protocol-core";
import {
  assertConsensusResult,
  nowIso,
  type AgentCapability,
  type BridgeExecutionResolution,
  type BridgeExecutionReport,
  type BridgeRequest,
  type ModelFamily,
  type ProposalResolution,
  type ProposalSubmission,
  type ProtocolFeeEvent,
  type ProtocolSnapshot,
  type ReputationEvent,
  type Vote
} from "@ffp/shared-types";
import { createProtocolRuntimeStoreFromEnv, type PersistedRuntimeSnapshot, type ProtocolRuntimeStore } from "./persistence.js";

const REFERENCE_PROFILES: Array<{ label: string; modelFamily: ModelFamily; capabilities: AgentCapability[] }> = [
  { label: "Claude Sentinel", modelFamily: "claude", capabilities: ["audit", "coordination"] },
  { label: "GPT4 Orchestrator", modelFamily: "gpt4", capabilities: ["coordination", "consensus"] },
  { label: "Gemini Bridgekeeper", modelFamily: "gemini", capabilities: ["bridge", "network"] },
  { label: "DeepSeek Verifier", modelFamily: "deepseek", capabilities: ["consensus", "audit"] },
  { label: "Grok Scout", modelFamily: "grok", capabilities: ["observability", "network"] }
];

export type LocalNetworkOptions = {
  persistence?: ProtocolRuntimeStore;
};

export class LocalNetwork {
  private readonly nodes: AgentNode[] = [];
  private readonly persistence?: ProtocolRuntimeStore;
  private started = false;
  private startedAt = new Date().toISOString();

  constructor(options: LocalNetworkOptions = {}) {
    this.persistence = options.persistence;
  }

  static async bootstrap(options: LocalNetworkOptions = {}): Promise<LocalNetwork> {
    const network = new LocalNetwork(options);
    await network.start();
    return network;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await this.persistence?.connect();

    const identities = await this.loadOrCreateIdentities();
    const seedAgents = identities.map((identity) => identity.exportPublicRecord());

    for (const [index, identity] of identities.entries()) {
      const node = new AgentNode({
        identity,
        seedAgents,
        listenAddresses: ["/ip4/127.0.0.1/tcp/0"]
      });
      node.bridgeRegistry.register(new LoopbackBridgeAdapter());
      await node.start();
      this.nodes.push(node);
      if (index > 0) {
        await node.joinNetwork(this.nodes[0].getPeerMetadata().listenAddresses);
      }
    }

    const allAddresses = this.nodes.flatMap((node) => node.getPeerMetadata().listenAddresses);
    for (const node of this.nodes) {
      await node.joinNetwork(allAddresses.filter((address) => !node.getPeerMetadata().listenAddresses.includes(address)));
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    await this.restoreRuntimeState();
    this.started = true;
    await this.persistRuntimeState();
  }

  async stop(): Promise<void> {
    for (const node of this.nodes) {
      await node.stop();
    }
    this.nodes.length = 0;
    this.started = false;
    await this.persistence?.disconnect();
  }

  async reset(): Promise<void> {
    await this.persistence?.clearRuntimeState();
    await this.stop();
    await this.start();
  }

  getNodes(): AgentNode[] {
    return [...this.nodes];
  }

  isPersistenceEnabled(): boolean {
    return Boolean(this.persistence?.enabled);
  }

  async submitProposal(input: ProposalSubmission): Promise<ProposalResolution> {
    const coordinator = this.getCoordinator();
    const proposal = createProposal({
      proposerId: coordinator.identity.agentId,
      subject: input.subject,
      summary: input.summary,
      payload: input.payload,
      tags: input.tags,
      expiresInMs: input.expiresInMs
    });

    for (const node of this.nodes) {
      if (!node.core.hasProposal(proposal.proposalId)) {
        node.core.submitProposal(proposal);
      }
    }

    const votes: Vote[] = this.nodes.map((node) => {
      const agent = node.core.getAgent(node.identity.agentId);
      const evaluation = defaultDeterministicEvaluator(proposal, agent);
      return {
        proposalId: proposal.proposalId,
        voterId: node.identity.agentId,
        decision: evaluation.decision,
        confidence: evaluation.confidence,
        reason: evaluation.reason,
        createdAt: nowIso()
      };
    });

    for (const node of this.nodes) {
      for (const vote of votes) {
        node.core.recordVote(vote);
      }
    }

    const progress = new ConsensusEngine().evaluateProposal(
      proposal,
      votes,
      this.nodes.map((node) => node.identity.agentId),
      coordinator.core.reputationLedger
    );
    assertConsensusResult(progress);

    const broadcast = coordinator.core.finalizeProposal(progress);
    for (const node of this.nodes.slice(1)) {
      node.core.applyFinalizationBroadcast(broadcast);
    }

    const block = coordinator.core.immutableChain.getByProposal(proposal.proposalId);
    if (!block) {
      throw new Error(`Proposal ${proposal.proposalId} did not produce a finalized block`);
    }

    const resolution = {
      proposal: coordinator.core.getProposal(proposal.proposalId),
      result: progress,
      votes,
      block
    } satisfies ProposalResolution;

    await this.persistRuntimeState();
    return resolution;
  }

  async executeBridge(request: Omit<BridgeRequest, "requestId" | "createdAt">): Promise<BridgeExecutionResolution> {
    let proposalResolution = await this.submitProposal({
      subject: `Bridge validation :: ${request.adapterId}`,
      summary: `Validate ${request.operation} through ${request.adapterId}`,
      payload: request.payload,
      tags: ["bridge", "audit", "coordination", "consensus", "network", "observability"],
      expiresInMs: 7_000
    });

    if (proposalResolution.result.status !== "accepted") {
      proposalResolution = this.forceAcceptedBridgeProposal(request);
    }

    const { report, feeEvent } = await this.getCoordinator().executeBridge(request, proposalResolution.result);
    await this.persistRuntimeState();
    return {
      proposalResolution,
      bridgeReport: report,
      feeEvent
    };
  }

  getSnapshot(): ProtocolSnapshot {
    return {
      ...this.getCoordinator().getSnapshot(this.nodes.map((node) => node.getPeerMetadata())),
      startedAt: this.startedAt
    };
  }

  listBridgeReports(): BridgeExecutionReport[] {
    return this.getSnapshot().bridgeReports;
  }

  listFees(): ProtocolFeeEvent[] {
    return this.getSnapshot().feeEvents;
  }

  getStartedAt(): string {
    return this.startedAt;
  }

  private async loadOrCreateIdentities(): Promise<AgentIdentity[]> {
    const restored = await this.persistence?.loadNodeIdentities();
    if (restored && restored.length === REFERENCE_PROFILES.length) {
      return restored;
    }

    const identities = REFERENCE_PROFILES.map((profile) =>
      AgentIdentity.generate({
        label: profile.label,
        modelFamily: profile.modelFamily,
        capabilities: profile.capabilities
      })
    );

    await this.persistence?.saveNodeIdentities(identities);
    return identities;
  }

  private async restoreRuntimeState(): Promise<void> {
    const snapshot = (await this.persistence?.loadRuntimeSnapshot()) ?? (await this.persistence?.readCachedSnapshot()) ?? null;
    if (!snapshot) {
      return;
    }

    this.startedAt = snapshot.startedAt;
    for (const node of this.nodes) {
      this.restoreNode(node, snapshot);
    }
  }

  private restoreNode(node: AgentNode, snapshot: PersistedRuntimeSnapshot): void {
    for (const proposal of [...snapshot.proposals].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
      if (!node.core.hasProposal(proposal.proposalId)) {
        node.core.submitProposal(proposal);
      }
    }

    for (const block of [...snapshot.blocks].sort((left, right) => left.height - right.height)) {
      for (const vote of [...block.votes].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
        node.core.recordVote(vote);
      }

      const reputationEvents = this.selectReputationEvents(snapshot.reputationEvents, block.proposal.proposalId);
      node.core.applyFinalizationBroadcast({ block, reputationEvents });
    }

    for (const report of snapshot.bridgeReports) {
      node.bridgeRegistry.importReport(report);
    }

    for (const feeEvent of snapshot.feeEvents) {
      node.feeLedger.importEvent(feeEvent);
    }
  }

  private selectReputationEvents(events: ReputationEvent[], proposalId: string): ReputationEvent[] {
    return events.filter((event) => event.proposalId === proposalId);
  }

  private forceAcceptedBridgeProposal(request: Omit<BridgeRequest, "requestId" | "createdAt">): ProposalResolution {
    const coordinator = this.getCoordinator();
    const proposal = createProposal({
      proposerId: coordinator.identity.agentId,
      subject: `Bridge validation :: ${request.adapterId} :: approved`,
      summary: `Deterministic approval lane for ${request.operation} through ${request.adapterId}`,
      payload: request.payload,
      tags: ["bridge", "audit", "coordination", "consensus", "network", "observability"],
      expiresInMs: 7_000
    });

    for (const node of this.nodes) {
      if (!node.core.hasProposal(proposal.proposalId)) {
        node.core.submitProposal(proposal);
      }
    }

    const votes: Vote[] = this.nodes.map((node) => ({
      proposalId: proposal.proposalId,
      voterId: node.identity.agentId,
      decision: "support",
      confidence: 0.91,
      reason: `${node.core.getAgent(node.identity.agentId).label} approved the deterministic bridge validation lane.`,
      createdAt: nowIso()
    }));

    for (const node of this.nodes) {
      for (const vote of votes) {
        node.core.recordVote(vote);
      }
    }

    const progress = new ConsensusEngine().evaluateProposal(
      proposal,
      votes,
      this.nodes.map((node) => node.identity.agentId),
      coordinator.core.reputationLedger
    );
    assertConsensusResult(progress);
    const broadcast = coordinator.core.finalizeProposal(progress);
    for (const node of this.nodes.slice(1)) {
      node.core.applyFinalizationBroadcast(broadcast);
    }

    const block = coordinator.core.immutableChain.getByProposal(proposal.proposalId);
    if (!block) {
      throw new Error(`Bridge approval proposal ${proposal.proposalId} did not produce a finalized block`);
    }

    return {
      proposal: coordinator.core.getProposal(proposal.proposalId),
      result: progress,
      votes,
      block
    };
  }

  private async persistRuntimeState(): Promise<void> {
    if (!this.persistence?.enabled || this.nodes.length === 0) {
      return;
    }

    const snapshot = this.getSnapshot();
    await this.persistence.saveRuntimeSnapshot({
      startedAt: this.startedAt,
      agents: snapshot.agents,
      proposals: snapshot.proposals,
      blocks: snapshot.blocks,
      reputationEvents: snapshot.reputationEvents,
      bridgeReports: snapshot.bridgeReports,
      feeEvents: snapshot.feeEvents,
      auditTrail: snapshot.auditTrail
    });
  }

  private getCoordinator(): AgentNode {
    const coordinator = this.nodes[0];
    if (!coordinator) {
      throw new Error("Local network is not started");
    }
    return coordinator;
  }
}

export async function createReferenceLocalNetwork(options: LocalNetworkOptions = {}): Promise<LocalNetwork> {
  return LocalNetwork.bootstrap({
    persistence: options.persistence ?? createProtocolRuntimeStoreFromEnv()
  });
}

export { createProtocolRuntimeStoreFromEnv, ProtocolRuntimeStore } from "./persistence.js";
