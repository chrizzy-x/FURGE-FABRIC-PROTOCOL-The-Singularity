import { hashPayload, makeId, nowIso, type AgentProfile, type AuditBlock, type AuditEvent, type ConsensusQuery, type ConsensusResult, type ExplorerProposalTrace, type MoneyAmount, type ProposalRecord, type VoteRecord } from "@furge/shared-types";
import type { DeployedChain } from "@furge/chain-builder";

export class FurgeProtocolCore {
  private readonly chains = new Map<string, DeployedChain>();
  private readonly agents = new Map<string, AgentProfile>();
  private readonly proposals = new Map<string, ProposalRecord>();
  private readonly votes = new Map<string, VoteRecord[]>();
  private readonly events: AuditEvent[] = [];
  private readonly blocks: AuditBlock[] = [];

  constructor(chains: DeployedChain[] = [], agents: AgentProfile[] = []) {
    chains.forEach((chain) => this.chains.set(chain.chainId, chain));
    agents.forEach((agent) => this.agents.set(agent.agentId, agent));
  }

  deployChain(chain: DeployedChain): void {
    this.chains.set(chain.chainId, chain);
    this.appendEvent(chain.chainId, "chain.deployed", "system", { chainId: chain.chainId, genesisHash: chain.genesisHash });
  }

  registerAgent(agent: AgentProfile): void {
    this.agents.set(agent.agentId, agent);
    this.appendEvent(agent.chain, "agent.registered", agent.agentId, { chain: agent.chain, capabilityCount: agent.capabilities.length });
  }

  createProposal(query: ConsensusQuery, estimatedFee: MoneyAmount): ProposalRecord {
    const chain = this.requireChain(query.chain);
    const createdAt = nowIso();
    const proposal: ProposalRecord = {
      id: makeId("proposal", `${query.chain}:${query.type}:${this.proposals.size}`),
      chain: query.chain,
      type: query.type,
      title: `${query.chain} :: ${query.type}`,
      requesterId: query.requesterId,
      input: query.input,
      metadata: query.metadata,
      status: "pending",
      createdAt,
      updatedAt: createdAt,
      confidenceTarget: query.minConfidence,
      finalityThreshold: chain.config.input.finalityThreshold,
      estimatedFee,
      explorerPath: `/proposals/${query.chain}/${query.type}/${this.proposals.size + 1}`
    };
    this.proposals.set(proposal.id, proposal);
    this.votes.set(proposal.id, []);
    this.appendEvent(query.chain, "proposal.created", query.requesterId, { type: query.type, input: query.input }, proposal.id);
    return proposal;
  }

  recordVote(vote: VoteRecord): void {
    const proposal = this.requireProposal(vote.proposalId);
    const proposalVotes = this.votes.get(vote.proposalId) ?? [];
    proposalVotes.push(vote);
    this.votes.set(vote.proposalId, proposalVotes);
    this.appendEvent(proposal.chain, "vote.recorded", vote.agentId, { decision: vote.decision, confidence: vote.confidence, weight: vote.weight }, vote.proposalId);
  }

  finalizeProposal(proposalId: string, consensus: ConsensusResult): ProposalRecord {
    const proposal = this.requireProposal(proposalId);
    proposal.status = consensus.status;
    proposal.updatedAt = nowIso();
    proposal.consensus = consensus;
    this.proposals.set(proposal.id, proposal);
    this.appendEvent(proposal.chain, `proposal.${consensus.status}`, "consensus-engine", { consensus }, proposal.id);
    this.appendBlock(proposal.chain, proposal.id, consensus.status !== "timeout");
    return proposal;
  }

  getChain(chainId: string): DeployedChain {
    return this.requireChain(chainId);
  }

  listChains(): DeployedChain[] {
    return Array.from(this.chains.values());
  }

  listAgents(chainId?: string): AgentProfile[] {
    return Array.from(this.agents.values()).filter((agent) => (chainId ? agent.chain === chainId : true));
  }

  updateAgents(agents: AgentProfile[]): void {
    agents.forEach((agent) => this.agents.set(agent.agentId, agent));
  }

  listProposals(chainId?: string): ProposalRecord[] {
    return Array.from(this.proposals.values()).filter((proposal) => (chainId ? proposal.chain === chainId : true));
  }

  getVotes(proposalId: string): VoteRecord[] {
    return [...(this.votes.get(proposalId) ?? [])];
  }

  getEvents(chainId?: string, proposalId?: string): AuditEvent[] {
    return this.events.filter((event) => (chainId ? event.chain === chainId : true) && (proposalId ? event.proposalId === proposalId : true));
  }

  getBlocks(chainId?: string): AuditBlock[] {
    return this.blocks.filter((block) => (chainId ? block.chain === chainId : true));
  }

  getExplorerTrace(proposalId: string): ExplorerProposalTrace {
    const proposal = this.requireProposal(proposalId);
    return {
      proposal,
      votes: this.getVotes(proposalId),
      events: this.getEvents(proposal.chain, proposalId),
      blocks: this.getBlocks(proposal.chain).filter((block) => block.proposalIds.includes(proposalId))
    };
  }

  private appendEvent(chain: string, type: string, actorId: string, payload: Record<string, unknown>, proposalId?: string): AuditEvent {
    const previousHash = this.events.filter((event) => event.chain === chain).at(-1)?.hash ?? "GENESIS";
    const index = this.events.filter((event) => event.chain === chain).length;
    const timestamp = nowIso();
    const event: AuditEvent = {
      id: makeId("event", `${chain}:${type}:${index}`),
      chain: chain as AuditEvent["chain"],
      type,
      proposalId,
      actorId,
      payload,
      timestamp,
      index,
      previousHash,
      hash: hashPayload({ chain, type, actorId, payload, proposalId, timestamp, index }, previousHash)
    };
    this.events.push(event);
    return event;
  }

  private appendBlock(chain: string, proposalId: string, consensusReached: boolean): AuditBlock {
    const previousBlock = this.blocks.filter((block) => block.chain === chain).at(-1);
    const height = previousBlock ? previousBlock.height + 1 : 1;
    const previousHash = previousBlock?.hash ?? "GENESIS";
    const createdAt = nowIso();
    const block: AuditBlock = {
      id: makeId("block", `${chain}:${height}`),
      chain: chain as AuditBlock["chain"],
      height,
      proposalIds: [proposalId],
      consensusReached,
      hash: hashPayload({ chain, height, proposalId, consensusReached, createdAt }, previousHash),
      previousHash,
      createdAt
    };
    this.blocks.push(block);
    return block;
  }

  private requireChain(chainId: string): DeployedChain {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} is not deployed`);
    }
    return chain;
  }

  private requireProposal(proposalId: string): ProposalRecord {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} was not found`);
    }
    return proposal;
  }
}