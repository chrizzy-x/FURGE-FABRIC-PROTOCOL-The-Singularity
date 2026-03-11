import { EventEmitter } from "node:events";
import { hashPayload, nowIso, type AgentProfile, type ChainId, type ConsensusQuery, type ProposalRecord, type VoteDecision, type VoteRecord } from "@furge/shared-types";

export type AgentNodeConfig = {
  agentId: string;
  family: AgentProfile["family"];
  displayName: string;
  chain: ChainId;
  agentType: string;
  specialization: string;
  capabilities: AgentProfile["capabilities"];
  reputation: number;
  stake?: number;
};

class DeterministicAdapter {
  constructor(private readonly profile: AgentProfile) {}

  evaluate(proposal: ProposalRecord): { decision: VoteDecision; confidence: number; reasoning: string } {
    const signal = hashPayload({ proposalId: proposal.id, agentId: this.profile.agentId });
    const score = parseInt(signal.slice(0, 8), 16) / 0xffffffff;
    const chainBoost = proposal.chain === this.profile.chain ? 0.18 : -0.1;
    const specializationBoost = proposal.type.includes(this.profile.agentType) || proposal.type.includes(this.profile.specialization) ? 0.14 : 0;
    const evidenceBoost = Array.isArray(proposal.metadata.citations) ? Math.min(proposal.metadata.citations.length * 0.03, 0.12) : 0;
    const confidence = Math.max(0.5, Math.min(0.97, score * 0.4 + 0.35 + chainBoost + specializationBoost + evidenceBoost));
    const decision: VoteDecision = confidence >= proposal.confidenceTarget ? "support" : confidence < proposal.confidenceTarget - 0.08 ? "reject" : "abstain";
    return {
      decision,
      confidence: Math.round(confidence * 100) / 100,
      reasoning: `${this.profile.displayName} reviewed ${proposal.type} for ${proposal.chain} with ${decision} at ${(confidence * 100).toFixed(0)}% confidence.`
    };
  }
}

export class AgentNode extends EventEmitter {
  private readonly adapter: DeterministicAdapter;
  private joinedChain: ChainId;
  private readonly profile: AgentProfile;

  constructor(config: AgentNodeConfig) {
    super();
    this.joinedChain = config.chain;
    this.profile = {
      agentId: config.agentId,
      family: config.family,
      displayName: config.displayName,
      chain: config.chain,
      agentType: config.agentType,
      specialization: config.specialization,
      capabilities: config.capabilities,
      reputation: config.reputation,
      stake: config.stake ?? 1000,
      seeded: true
    };
    this.adapter = new DeterministicAdapter(this.profile);
  }

  get agent(): AgentProfile {
    return this.profile;
  }

  async joinChain(chain: ChainId): Promise<void> {
    this.joinedChain = chain;
    this.emit("chain-joined", chain);
  }

  createProposal(input: Pick<ConsensusQuery, "type" | "input" | "metadata" | "requesterId" | "minConfidence">): ProposalRecord {
    const timestamp = nowIso();
    return {
      id: `proposal-${hashPayload(`${this.profile.agentId}:${timestamp}`).slice(0, 10)}`,
      chain: this.joinedChain,
      type: input.type,
      title: `${this.joinedChain} :: ${input.type}`,
      requesterId: input.requesterId,
      input: input.input,
      metadata: input.metadata,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
      confidenceTarget: input.minConfidence,
      finalityThreshold: 0.67,
      estimatedFee: { token: "TEST", amount: 0 },
      explorerPath: `/proposals/${this.joinedChain}/${input.type}/${timestamp}`
    };
  }

  async evaluate(proposal: ProposalRecord): Promise<VoteRecord> {
    const evaluation = this.adapter.evaluate(proposal);
    const vote: VoteRecord = {
      proposalId: proposal.id,
      agentId: this.profile.agentId,
      decision: evaluation.decision,
      confidence: evaluation.confidence,
      reasoning: evaluation.reasoning,
      weight: this.profile.reputation,
      timestamp: nowIso()
    };
    this.emit("proposal-received", proposal);
    this.emit("vote", vote);
    return vote;
  }

  async castVote(proposalId: string, vote: VoteRecord): Promise<VoteRecord> {
    const castVote = { ...vote, proposalId };
    this.emit("vote-cast", castVote);
    return castVote;
  }
}