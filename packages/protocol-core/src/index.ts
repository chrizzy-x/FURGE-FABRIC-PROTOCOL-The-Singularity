import { createHash, createSign, createVerify, generateKeyPairSync } from "node:crypto";
import {
  AgentRecordSchema,
  AuditEventSchema,
  BlockSchema,
  DEFAULT_INITIAL_REPUTATION,
  ProposalSchema,
  type AgentCapability,
  type AgentRecord,
  type AuditEvent,
  type Block,
  type ConsensusResult,
  type ModelFamily,
  type Proposal,
  type ReputationEvent,
  type SignedEnvelope,
  type Vote,
  clampReputation,
  hashValue,
  makeDeterministicId,
  nowIso,
  stableSerialize
} from "@ffp/shared-types";

export type AgentIdentityCreateInput = {
  label: string;
  modelFamily: ModelFamily;
  capabilities: AgentCapability[];
  reputation?: number;
};

export type AgentIdentityImportInput = AgentIdentityCreateInput & {
  privateKeyPem: string;
  publicKeyPem: string;
  createdAt?: string;
};

export class AgentIdentity {
  readonly agentId: string;
  readonly createdAt: string;

  private constructor(
    readonly label: string,
    readonly modelFamily: ModelFamily,
    readonly capabilities: AgentCapability[],
    readonly reputation: number,
    readonly publicKeyPem: string,
    private readonly privateKeyPem: string,
    createdAt?: string
  ) {
    this.createdAt = createdAt ?? nowIso();
    this.agentId = AgentIdentity.deriveAgentId(publicKeyPem);
  }

  static generate(input: AgentIdentityCreateInput): AgentIdentity {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      }
    });

    return new AgentIdentity(
      input.label,
      input.modelFamily,
      input.capabilities,
      input.reputation ?? DEFAULT_INITIAL_REPUTATION,
      publicKey,
      privateKey
    );
  }

  static import(input: AgentIdentityImportInput): AgentIdentity {
    return new AgentIdentity(
      input.label,
      input.modelFamily,
      input.capabilities,
      input.reputation ?? DEFAULT_INITIAL_REPUTATION,
      input.publicKeyPem,
      input.privateKeyPem,
      input.createdAt
    );
  }

  static deriveAgentId(publicKeyPem: string): string {
    return createHash("sha256").update(publicKeyPem).digest("hex");
  }

  exportPublicRecord(peerId?: string): AgentRecord {
    return AgentRecordSchema.parse({
      agentId: this.agentId,
      label: this.label,
      modelFamily: this.modelFamily,
      publicKey: this.publicKeyPem,
      capabilities: this.capabilities,
      reputation: clampReputation(this.reputation),
      createdAt: this.createdAt,
      peerId
    });
  }

  exportKeyMaterial(): {
    agentId: string;
    label: string;
    modelFamily: ModelFamily;
    capabilities: AgentCapability[];
    publicKeyPem: string;
    privateKeyPem: string;
    createdAt: string;
  } {
    return {
      agentId: this.agentId,
      label: this.label,
      modelFamily: this.modelFamily,
      capabilities: [...this.capabilities],
      publicKeyPem: this.publicKeyPem,
      privateKeyPem: this.privateKeyPem,
      createdAt: this.createdAt
    };
  }

  signEnvelope<T>(kind: SignedEnvelope<T>["kind"], payload: T): SignedEnvelope<T> {
    const createdAt = nowIso();
    const digest = AgentIdentity.digestEnvelope(kind, this.agentId, createdAt, payload);
    const signer = createSign("RSA-SHA256");
    signer.update(digest);
    signer.end();

    return {
      kind,
      signerId: this.agentId,
      publicKey: this.publicKeyPem,
      createdAt,
      digest,
      payload,
      signature: signer.sign(this.privateKeyPem, "base64")
    };
  }

  static verifyEnvelope<T>(envelope: SignedEnvelope<T>): boolean {
    if (AgentIdentity.deriveAgentId(envelope.publicKey) !== envelope.signerId) {
      return false;
    }

    const digest = AgentIdentity.digestEnvelope(envelope.kind, envelope.signerId, envelope.createdAt, envelope.payload);
    if (digest !== envelope.digest) {
      return false;
    }

    const verifier = createVerify("RSA-SHA256");
    verifier.update(digest);
    verifier.end();
    return verifier.verify(envelope.publicKey, envelope.signature, "base64");
  }

  private static digestEnvelope<T>(kind: SignedEnvelope<T>["kind"], signerId: string, createdAt: string, payload: T): string {
    return hashValue({ kind, signerId, createdAt, payload });
  }
}

export type ReputationPolicy = {
  alignedReward: number;
  opposedPenalty: number;
  abstainPenalty: number;
};

export class ReputationLedger {
  private readonly scores = new Map<string, number>();
  private readonly history: ReputationEvent[] = [];
  readonly policy: ReputationPolicy;

  constructor(initialScores: AgentRecord[] = [], policy: Partial<ReputationPolicy> = {}) {
    this.policy = {
      alignedReward: policy.alignedReward ?? 10,
      opposedPenalty: policy.opposedPenalty ?? 12,
      abstainPenalty: policy.abstainPenalty ?? 1
    };

    for (const agent of initialScores) {
      this.scores.set(agent.agentId, clampReputation(agent.reputation));
    }
  }

  registerAgent(agent: AgentRecord): void {
    this.scores.set(agent.agentId, clampReputation(agent.reputation));
  }

  getScore(agentId: string): number {
    return this.scores.get(agentId) ?? DEFAULT_INITIAL_REPUTATION;
  }

  snapshot(): Array<{ agentId: string; reputation: number }> {
    return Array.from(this.scores.entries()).map(([agentId, reputation]) => ({ agentId, reputation }));
  }

  listEvents(): ReputationEvent[] {
    return [...this.history];
  }

  applyConsensusOutcome(result: ConsensusResult, votes: Vote[]): ReputationEvent[] {
    if (result.status === "timed_out") {
      return [];
    }

    const events: ReputationEvent[] = [];

    for (const vote of votes) {
      const before = this.getScore(vote.voterId);
      const delta = vote.decision === "abstain"
        ? -this.policy.abstainPenalty
        : (vote.decision === "support" && result.status === "accepted") || (vote.decision === "reject" && result.status === "rejected")
          ? this.policy.alignedReward
          : -this.policy.opposedPenalty;

      const after = clampReputation(before + delta);
      this.scores.set(vote.voterId, after);
      const event: ReputationEvent = {
        eventId: makeDeterministicId("rep", `${result.proposalId}:${vote.voterId}:${this.history.length}`),
        agentId: vote.voterId,
        proposalId: result.proposalId,
        delta,
        before,
        after,
        reason: delta >= 0 ? "Vote aligned with finalized consensus" : "Vote diverged from finalized consensus",
        createdAt: result.finalizedAt
      };
      this.history.push(event);
      events.push(event);
    }

    return events;
  }

  importEvents(events: ReputationEvent[]): void {
    for (const event of events) {
      this.scores.set(event.agentId, clampReputation(event.after));
      this.history.push(event);
    }
  }
}

export class ImmutableChain {
  private readonly blocks: Block[] = [];

  append(proposal: Proposal, votes: Vote[], result: ConsensusResult, auditEvents: AuditEvent[]): Block {
    const previousHash = this.blocks.at(-1)?.hash ?? "GENESIS";
    const createdAt = result.finalizedAt;
    const block: Block = BlockSchema.parse({
      blockId: makeDeterministicId("block", `${proposal.proposalId}:${this.blocks.length + 1}`),
      height: this.blocks.length + 1,
      previousHash,
      hash: hashValue({ proposal, votes, result, auditEvents, createdAt, height: this.blocks.length + 1 }, previousHash),
      createdAt,
      proposal,
      votes,
      result,
      auditEvents
    });
    this.blocks.push(block);
    return block;
  }

  importBlock(block: Block): void {
    const previousHash = this.blocks.at(-1)?.hash ?? "GENESIS";
    if (block.previousHash !== previousHash) {
      throw new Error(`Block ${block.blockId} broke the local chain linkage`);
    }

    const expectedHash = hashValue(
      {
        proposal: block.proposal,
        votes: block.votes,
        result: block.result,
        auditEvents: block.auditEvents,
        createdAt: block.createdAt,
        height: block.height
      },
      block.previousHash
    );

    if (expectedHash !== block.hash) {
      throw new Error(`Block ${block.blockId} failed hash verification`);
    }

    this.blocks.push(BlockSchema.parse(block));
  }

  listBlocks(): Block[] {
    return [...this.blocks];
  }

  getByProposal(proposalId: string): Block | undefined {
    return this.blocks.find((block) => block.proposal.proposalId === proposalId);
  }

  verify(): { valid: boolean; brokenAtHeight?: number } {
    let previousHash = "GENESIS";

    for (const block of this.blocks) {
      if (block.previousHash !== previousHash) {
        return { valid: false, brokenAtHeight: block.height };
      }

      const expectedHash = hashValue(
        {
          proposal: block.proposal,
          votes: block.votes,
          result: block.result,
          auditEvents: block.auditEvents,
          createdAt: block.createdAt,
          height: block.height
        },
        block.previousHash
      );

      if (expectedHash !== block.hash) {
        return { valid: false, brokenAtHeight: block.height };
      }

      previousHash = block.hash;
    }

    return { valid: true };
  }
}

export type FinalizationBroadcast = {
  block: Block;
  reputationEvents: ReputationEvent[];
};

export class ProtocolCore {
  private readonly agents = new Map<string, AgentRecord>();
  private readonly proposals = new Map<string, Proposal>();
  private readonly votes = new Map<string, Vote[]>();
  private readonly results = new Map<string, ConsensusResult>();
  private readonly auditTrail: AuditEvent[] = [];
  readonly reputationLedger: ReputationLedger;
  readonly immutableChain: ImmutableChain;

  constructor(seedAgents: AgentRecord[] = []) {
    this.reputationLedger = new ReputationLedger(seedAgents);
    this.immutableChain = new ImmutableChain();

    for (const agent of seedAgents) {
      this.registerAgent(agent);
    }
  }

  registerAgent(agent: AgentRecord): void {
    const normalized = AgentRecordSchema.parse({ ...agent, reputation: clampReputation(agent.reputation) });
    this.agents.set(agent.agentId, normalized);
    this.reputationLedger.registerAgent(normalized);
    this.auditTrail.push(
      AuditEventSchema.parse({
        eventId: makeDeterministicId("audit", `${agent.agentId}:${this.auditTrail.length}`),
        type: "agent.registered",
        actorId: agent.agentId,
        referenceId: agent.agentId,
        createdAt: normalized.createdAt,
        payload: {
          label: agent.label,
          modelFamily: agent.modelFamily,
          capabilities: agent.capabilities,
          reputation: normalized.reputation
        }
      })
    );
  }

  listAgents(): AgentRecord[] {
    return Array.from(this.agents.values()).map((agent) => ({
      ...agent,
      reputation: this.reputationLedger.getScore(agent.agentId)
    }));
  }

  getAgent(agentId: string): AgentRecord {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Unknown agent ${agentId}`);
    }
    return {
      ...agent,
      reputation: this.reputationLedger.getScore(agentId)
    };
  }

  listAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  submitProposal(proposal: Proposal): Proposal {
    const parsed = ProposalSchema.parse(proposal);
    this.proposals.set(parsed.proposalId, parsed);
    this.votes.set(parsed.proposalId, []);
    this.auditTrail.push(
      AuditEventSchema.parse({
        eventId: makeDeterministicId("audit", `${parsed.proposalId}:proposal:${this.auditTrail.length}`),
        type: "proposal.submitted",
        actorId: parsed.proposerId,
        referenceId: parsed.proposalId,
        createdAt: parsed.createdAt,
        payload: {
          subject: parsed.subject,
          summary: parsed.summary,
          tags: parsed.tags
        }
      })
    );
    return parsed;
  }

  hasProposal(proposalId: string): boolean {
    return this.proposals.has(proposalId);
  }

  getProposal(proposalId: string): Proposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Unknown proposal ${proposalId}`);
    }
    const result = this.results.get(proposalId);
    return result ? { ...proposal, status: result.status } : proposal;
  }

  listProposals(): Proposal[] {
    return Array.from(this.proposals.values()).map((proposal) => {
      const result = this.results.get(proposal.proposalId);
      return result ? { ...proposal, status: result.status } : proposal;
    });
  }

  recordVote(vote: Vote): Vote {
    if (!this.proposals.has(vote.proposalId)) {
      throw new Error(`Vote references unknown proposal ${vote.proposalId}`);
    }

    const proposalVotes = this.votes.get(vote.proposalId) ?? [];
    if (proposalVotes.some((entry) => entry.voterId === vote.voterId)) {
      return proposalVotes.find((entry) => entry.voterId === vote.voterId) as Vote;
    }

    proposalVotes.push(vote);
    this.votes.set(vote.proposalId, proposalVotes);
    this.auditTrail.push(
      AuditEventSchema.parse({
        eventId: makeDeterministicId("audit", `${vote.proposalId}:vote:${vote.voterId}`),
        type: "vote.recorded",
        actorId: vote.voterId,
        referenceId: vote.proposalId,
        createdAt: vote.createdAt,
        payload: {
          decision: vote.decision,
          confidence: vote.confidence,
          reason: vote.reason
        }
      })
    );
    return vote;
  }

  listVotes(proposalId: string): Vote[] {
    return [...(this.votes.get(proposalId) ?? [])];
  }

  isFinalized(proposalId: string): boolean {
    return this.results.has(proposalId);
  }

  getResult(proposalId: string): ConsensusResult | undefined {
    return this.results.get(proposalId);
  }

  finalizeProposal(result: ConsensusResult): FinalizationBroadcast {
    const proposal = this.getProposal(result.proposalId);
    const votes = this.listVotes(result.proposalId);
    const finalAuditEvents = [
      AuditEventSchema.parse({
        eventId: makeDeterministicId("audit", `${result.proposalId}:final:${this.auditTrail.length}`),
        type: "proposal.finalized",
        actorId: proposal.proposerId,
        referenceId: result.proposalId,
        createdAt: result.finalizedAt,
        payload: {
          status: result.status,
          rationale: result.rationale,
          confidence: result.confidence
        }
      })
    ];

    this.results.set(result.proposalId, result);
    const reputationEvents = this.reputationLedger.applyConsensusOutcome(result, votes);
    for (const event of finalAuditEvents) {
      this.auditTrail.push(event);
    }
    const block = this.immutableChain.append({ ...proposal, status: result.status }, votes, result, finalAuditEvents);
    return { block, reputationEvents };
  }

  applyFinalizationBroadcast(broadcast: FinalizationBroadcast): void {
    const { block, reputationEvents } = broadcast;
    if (this.results.has(block.proposal.proposalId)) {
      return;
    }

    this.proposals.set(block.proposal.proposalId, block.proposal);
    this.votes.set(block.proposal.proposalId, block.votes);
    this.results.set(block.proposal.proposalId, block.result as ConsensusResult);
    for (const event of block.auditEvents) {
      this.auditTrail.push(event);
    }
    this.reputationLedger.importEvents(reputationEvents);
    this.immutableChain.importBlock(block);
  }

  listAuditTrail(referenceId?: string): AuditEvent[] {
    return referenceId ? this.auditTrail.filter((event) => event.referenceId === referenceId) : [...this.auditTrail];
  }

  appendAuditEvent(event: AuditEvent): AuditEvent {
    const parsed = AuditEventSchema.parse(event);
    this.auditTrail.push(parsed);
    return parsed;
  }
}

export function createProposal(input: {
  proposerId: string;
  subject: string;
  summary: string;
  payload: Record<string, unknown>;
  tags?: string[];
  expiresInMs?: number;
}): Proposal {
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + (input.expiresInMs ?? 5_000)).toISOString();
  return ProposalSchema.parse({
    proposalId: makeDeterministicId("proposal", `${input.proposerId}:${input.subject}:${createdAt}`),
    proposerId: input.proposerId,
    subject: input.subject,
    summary: input.summary,
    payload: input.payload,
    tags: input.tags ?? [],
    createdAt,
    expiresAt,
    status: "pending"
  });
}

export function createDeterministicProposalDigest(proposal: Proposal): string {
  return hashValue({
    proposalId: proposal.proposalId,
    proposerId: proposal.proposerId,
    subject: proposal.subject,
    summary: proposal.summary,
    payload: proposal.payload,
    tags: proposal.tags,
    createdAt: proposal.createdAt,
    expiresAt: proposal.expiresAt
  });
}

export function verifyPublicRecord(record: AgentRecord): boolean {
  if (AgentIdentity.deriveAgentId(record.publicKey) !== record.agentId) {
    return false;
  }

  const parsed = AgentRecordSchema.safeParse(record);
  return parsed.success;
}

export function verifyBlockHash(block: Block): boolean {
  return hashValue(
    {
      proposal: block.proposal,
      votes: block.votes,
      result: block.result,
      auditEvents: block.auditEvents,
      createdAt: block.createdAt,
      height: block.height
    },
    block.previousHash
  ) === block.hash;
}

export function createTamperedBlock(block: Block): Block {
  return {
    ...block,
    hash: hashValue({ tampered: stableSerialize(block) })
  };
}

