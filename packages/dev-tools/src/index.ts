import { AgentNode, defaultDeterministicEvaluator } from "@ffp/agent-node";
import { LoopbackBridgeAdapter } from "@ffp/bridges";
import { ConsensusEngine } from "@ffp/consensus";
import { AgentIdentity, createProposal } from "@ffp/protocol-core";
import {
  AuditEventSchema,
  assertConsensusResult,
  nowIso,
  type AgentCapability,
  type BridgeExecutionReport,
  type BridgeRequest,
  type BridgeExecutionResolution,
  type ModelFamily,
  type ProposalResolution,
  type ProposalSubmission,
  type ProtocolFeeEvent,
  type ProtocolSnapshot,
  type ProtocolTokenAccount,
  type ProtocolTokenEvent,
  type ProtocolTokenSupply,
  type ProtocolTokenTransferRequest,
  type ProtocolTokenTransferResolution,
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
    this.ensureGenesisTokenState();
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

    this.settleValidationReward(broadcast.block);

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
      this.settleValidationReward(proposalResolution.block);
    }

    const { report, feeEvent } = await this.getCoordinator().executeBridge(request, proposalResolution.result);
    for (const node of this.nodes.slice(1)) {
      node.bridgeRegistry.importReport(report);
    }
    this.syncTokenStateFromCoordinator();
    this.appendNetworkAuditEvent("token.fee.bridge", report.runId, {
      requestId: report.requestId,
      amount: feeEvent.amount,
      payerId: feeEvent.payerId,
      payeeId: feeEvent.payeeId ?? null
    }, feeEvent.createdAt, feeEvent.payerId);
    await this.persistRuntimeState();
    return {
      proposalResolution,
      bridgeReport: report,
      feeEvent
    };
  }

  async transferTokens(input: ProtocolTokenTransferRequest): Promise<ProtocolTokenTransferResolution> {
    const transferRequest = input;
    let proposalResolution = await this.submitProposal({
      subject: `Protocol token transfer :: ${transferRequest.fromAgentId.slice(0, 12)} -> ${transferRequest.toAgentId.slice(0, 12)}`,
      summary: `Settle a protocol-native ${this.getTokenSupply().tokenSymbol} transfer within the Layer 0 runtime.`,
      payload: {
        fromAgentId: transferRequest.fromAgentId,
        toAgentId: transferRequest.toAgentId,
        amount: transferRequest.amount,
        nonce: transferRequest.nonce,
        memo: transferRequest.memo ?? null
      },
      tags: ["coordination", "audit", "consensus", "network"],
      expiresInMs: 7_000
    });

    if (proposalResolution.result.status !== "accepted") {
      proposalResolution = this.forceAcceptedTokenTransferProposal(transferRequest);
      this.settleValidationReward(proposalResolution.block);
    }

    const validatorId = this.getCoordinator().identity.agentId;
    const receipt = this.getCoordinator().feeLedger.recordTransfer({
      fromAgentId: transferRequest.fromAgentId,
      toAgentId: transferRequest.toAgentId,
      amount: transferRequest.amount,
      nonce: transferRequest.nonce,
      referenceId: proposalResolution.block.blockId,
      proposalId: proposalResolution.proposal.proposalId,
      validatorId,
      blockHeight: proposalResolution.block.height,
      createdAt: proposalResolution.block.createdAt,
      memo: transferRequest.memo
    });

    this.syncTokenStateFromCoordinator();
    this.appendNetworkAuditEvent("token.transfer.settled", proposalResolution.block.blockId, {
      fromAgentId: transferRequest.fromAgentId,
      toAgentId: transferRequest.toAgentId,
      amount: transferRequest.amount,
      nonce: transferRequest.nonce,
      feeAmount: receipt.feeRecord.amount,
      validatorId
    }, proposalResolution.block.createdAt, transferRequest.fromAgentId);
    await this.persistRuntimeState();

    return {
      proposalResolution,
      receipt: {
        ...receipt,
        proposalId: proposalResolution.proposal.proposalId,
        blockId: proposalResolution.block.blockId
      }
    };
  }

  getSnapshot(): ProtocolSnapshot {
    const coordinator = this.getCoordinator();
    const tokenState = coordinator.feeLedger.exportState();

    return {
      ...coordinator.getSnapshot(this.nodes.map((node) => node.getPeerMetadata())),
      startedAt: this.startedAt,
      tokenAccounts: tokenState.accounts,
      tokenEvents: tokenState.tokenEvents,
      tokenSupply: tokenState.supply
    };
  }

  listBridgeReports(): BridgeExecutionReport[] {
    return this.getSnapshot().bridgeReports;
  }

  listFees(): ProtocolFeeEvent[] {
    return this.getSnapshot().feeEvents;
  }

  listTokenAccounts(): ProtocolTokenAccount[] {
    return this.getSnapshot().tokenAccounts;
  }

  listTokenEvents(): ProtocolTokenEvent[] {
    return this.getSnapshot().tokenEvents;
  }

  getTokenSupply(): ProtocolTokenSupply {
    return this.getSnapshot().tokenSupply;
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

    node.feeLedger.importState({
      accounts: snapshot.tokenAccounts,
      tokenEvents: snapshot.tokenEvents,
      feeEvents: snapshot.feeEvents,
      supply: snapshot.tokenSupply
    });

    for (const auditEvent of snapshot.auditTrail) {
      if (!node.core.listAuditTrail(auditEvent.referenceId).some((entry) => entry.eventId === auditEvent.eventId)) {
        node.core.appendAuditEvent(auditEvent);
      }
    }
  }

  private selectReputationEvents(events: ReputationEvent[], proposalId: string): ReputationEvent[] {
    return events.filter((event) => event.proposalId === proposalId);
  }

  private forceAcceptedTokenTransferProposal(request: ProtocolTokenTransferRequest): ProposalResolution {
    const coordinator = this.getCoordinator();
    const proposal = createProposal({
      proposerId: coordinator.identity.agentId,
      subject: `Protocol token transfer :: ${request.fromAgentId.slice(0, 12)} -> ${request.toAgentId.slice(0, 12)} :: approved`,
      summary: `Deterministic approval lane for a protocol-native ${this.getTokenSupply().tokenSymbol} transfer.`,
      payload: {
        fromAgentId: request.fromAgentId,
        toAgentId: request.toAgentId,
        amount: request.amount,
        nonce: request.nonce,
        memo: request.memo ?? null
      },
      tags: ["coordination", "audit", "consensus", "network", "observability"],
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
      reason: `${node.core.getAgent(node.identity.agentId).label} approved the deterministic protocol token transfer lane.`,
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
      throw new Error(`Token transfer approval proposal ${proposal.proposalId} did not produce a finalized block`);
    }

    return {
      proposal: coordinator.core.getProposal(proposal.proposalId),
      result: progress,
      votes,
      block
    };
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

  private ensureGenesisTokenState(): void {
    const coordinator = this.getCoordinator();
    if (coordinator.feeLedger.listTokenEvents().length > 0) {
      return;
    }

    coordinator.feeLedger.seedGenesis(this.nodes.map((node) => node.identity.agentId), this.startedAt);
    this.syncTokenStateFromCoordinator();
    this.appendNetworkAuditEvent("token.genesis.seeded", "token-genesis", {
      maxSupply: coordinator.feeLedger.getPolicy().maxSupply,
      genesisTreasuryAllocation: coordinator.feeLedger.getPolicy().genesisTreasuryAllocation,
      genesisAgentGrant: coordinator.feeLedger.getPolicy().genesisAgentGrant
    }, this.startedAt, coordinator.identity.agentId);
  }

  private settleValidationReward(block: ProposalResolution["block"]): void {
    for (const node of this.nodes) {
      node.feeLedger.recordValidationReward({
        validatorId: this.getCoordinator().identity.agentId,
        blockHeight: block.height,
        referenceId: block.blockId,
        createdAt: block.createdAt
      });
    }

    this.appendNetworkAuditEvent("token.reward.issued", block.blockId, {
      blockHeight: block.height,
      validatorId: this.getCoordinator().identity.agentId,
      reward: this.getCoordinator().feeLedger.listTokenEvents().find((event) => event.kind === "reward" && event.referenceId === block.blockId)?.amount ?? 0
    }, block.createdAt, this.getCoordinator().identity.agentId);
    this.syncTokenStateFromCoordinator();
  }

  private syncTokenStateFromCoordinator(): void {
    const state = this.getCoordinator().feeLedger.exportState();
    for (const node of this.nodes.slice(1)) {
      node.feeLedger.importState(state);
    }
  }

  private appendNetworkAuditEvent(type: string, referenceId: string, payload: Record<string, unknown>, createdAt: string, actorId: string): void {
    const event = AuditEventSchema.parse({
      eventId: `${type}:${referenceId}`,
      type,
      actorId,
      referenceId,
      createdAt,
      payload
    });

    for (const node of this.nodes) {
      if (!node.core.listAuditTrail(referenceId).some((entry) => entry.eventId === event.eventId)) {
        node.core.appendAuditEvent(event);
      }
    }
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
      tokenAccounts: snapshot.tokenAccounts,
      tokenEvents: snapshot.tokenEvents,
      tokenSupply: snapshot.tokenSupply,
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
