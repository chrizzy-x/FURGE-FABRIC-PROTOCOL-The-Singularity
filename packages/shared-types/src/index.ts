import { createHash } from "node:crypto";
import { z } from "zod";

export const PROTOCOL_TOPIC = "ffp.protocol.v1";
export const DEFAULT_THRESHOLD = 2 / 3;
export const DEFAULT_INITIAL_REPUTATION = 100;
export const MAX_REPUTATION = 1000;
export const MIN_REPUTATION = 0;
export const PROTOCOL_TOKEN_SYMBOL = "$FURGE";

export const MODEL_FAMILIES = ["claude", "gpt4", "gemini", "deepseek", "grok"] as const;
export type ModelFamily = (typeof MODEL_FAMILIES)[number];

export const CAPABILITIES = ["audit", "bridge", "consensus", "coordination", "network", "observability"] as const;
export type AgentCapability = (typeof CAPABILITIES)[number];

export const MESSAGE_KINDS = ["proposal", "vote", "block", "bridge"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected", "timed_out"] as const;
export const FINAL_PROPOSAL_STATUSES = ["accepted", "rejected", "timed_out"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export type FinalProposalStatus = (typeof FINAL_PROPOSAL_STATUSES)[number];

export const VOTE_DECISIONS = ["support", "reject", "abstain"] as const;
export type VoteDecision = (typeof VOTE_DECISIONS)[number];

export const BRIDGE_DIRECTIONS = ["ingress", "egress", "bidirectional"] as const;
export type BridgeDirection = (typeof BRIDGE_DIRECTIONS)[number];

export const TOKEN_ACCOUNT_OWNER_TYPES = ["agent", "system"] as const;
export type TokenAccountOwnerType = (typeof TOKEN_ACCOUNT_OWNER_TYPES)[number];

const recordSchema = z.record(z.string(), z.unknown());

export const AgentRecordSchema = z.object({
  agentId: z.string().min(64).max(64),
  label: z.string().min(1),
  modelFamily: z.enum(MODEL_FAMILIES),
  publicKey: z.string().min(1),
  capabilities: z.array(z.enum(CAPABILITIES)).min(1),
  reputation: z.number().min(MIN_REPUTATION).max(MAX_REPUTATION),
  createdAt: z.string().datetime(),
  peerId: z.string().optional()
});
export type AgentRecord = z.infer<typeof AgentRecordSchema>;

export const ProposalSchema = z.object({
  proposalId: z.string().min(1),
  proposerId: z.string().min(64).max(64),
  subject: z.string().min(3),
  summary: z.string().min(3),
  payload: recordSchema,
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: z.enum(PROPOSAL_STATUSES).default("pending")
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const VoteSchema = z.object({
  proposalId: z.string().min(1),
  voterId: z.string().min(64).max(64),
  decision: z.enum(VOTE_DECISIONS),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(3),
  createdAt: z.string().datetime()
});
export type Vote = z.infer<typeof VoteSchema>;

export const ConsensusProgressSchema = z.object({
  proposalId: z.string().min(1),
  status: z.union([z.literal("pending"), z.enum(FINAL_PROPOSAL_STATUSES)]),
  threshold: z.number().min(0).max(1),
  eligibleWeight: z.number().nonnegative(),
  supportWeight: z.number().nonnegative(),
  rejectWeight: z.number().nonnegative(),
  abstainWeight: z.number().nonnegative(),
  missingWeight: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(3),
  finalizedAt: z.string().datetime().optional(),
  alignedAgentIds: z.array(z.string()),
  opposingAgentIds: z.array(z.string())
});
export type ConsensusProgress = z.infer<typeof ConsensusProgressSchema>;
export type ConsensusResult = ConsensusProgress & { status: FinalProposalStatus; finalizedAt: string };

export const ReputationEventSchema = z.object({
  eventId: z.string().min(1),
  agentId: z.string().min(64).max(64),
  proposalId: z.string().min(1),
  delta: z.number(),
  before: z.number().min(MIN_REPUTATION).max(MAX_REPUTATION),
  after: z.number().min(MIN_REPUTATION).max(MAX_REPUTATION),
  reason: z.string().min(3),
  createdAt: z.string().datetime()
});
export type ReputationEvent = z.infer<typeof ReputationEventSchema>;

export const AuditEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.string().min(1),
  actorId: z.string().min(1),
  referenceId: z.string().min(1),
  createdAt: z.string().datetime(),
  payload: recordSchema
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const BlockSchema = z.object({
  blockId: z.string().min(1),
  height: z.number().int().positive(),
  previousHash: z.string().min(1),
  hash: z.string().min(64).max(64),
  createdAt: z.string().datetime(),
  proposal: ProposalSchema,
  votes: z.array(VoteSchema),
  result: ConsensusProgressSchema,
  auditEvents: z.array(AuditEventSchema)
});
export type Block = z.infer<typeof BlockSchema>;

export const BridgeAdapterManifestSchema = z.object({
  adapterId: z.string().min(1),
  version: z.string().min(1),
  direction: z.enum(BRIDGE_DIRECTIONS),
  supportedOperations: z.array(z.string()).min(1),
  description: z.string().min(3)
});
export type BridgeAdapterManifest = z.infer<typeof BridgeAdapterManifestSchema>;

export const BridgeRequestSchema = z.object({
  requestId: z.string().min(1),
  adapterId: z.string().min(1),
  operation: z.string().min(1),
  payload: recordSchema,
  requestedBy: z.string().min(64).max(64),
  createdAt: z.string().datetime()
});
export type BridgeRequest = z.infer<typeof BridgeRequestSchema>;

export const BridgeValidationSchema = z.object({
  valid: z.boolean(),
  reasons: z.array(z.string()),
  normalizedPayload: recordSchema.optional()
});
export type BridgeValidation = z.infer<typeof BridgeValidationSchema>;

export const BridgeRecoverySchema = z.object({
  attempted: z.boolean(),
  summary: z.string().min(3),
  payload: recordSchema.default({})
});
export type BridgeRecovery = z.infer<typeof BridgeRecoverySchema>;

export const BridgeExecutionReportSchema = z.object({
  runId: z.string().min(1),
  adapterId: z.string().min(1),
  requestId: z.string().min(1),
  status: z.enum(["validated", "executed", "failed", "recovered"]),
  validation: BridgeValidationSchema,
  response: recordSchema,
  recovery: BridgeRecoverySchema.optional(),
  createdAt: z.string().datetime(),
  consensusStatus: z.enum(FINAL_PROPOSAL_STATUSES)
});
export type BridgeExecutionReport = z.infer<typeof BridgeExecutionReportSchema>;

export const ProtocolFeeEventSchema = z.object({
  feeEventId: z.string().min(1),
  tokenSymbol: z.literal(PROTOCOL_TOKEN_SYMBOL),
  amount: z.number().positive(),
  kind: z.enum(["bridge", "coordination"]),
  payerId: z.string().min(64).max(64),
  payeeId: z.string().min(1).optional(),
  referenceId: z.string().min(1),
  createdAt: z.string().datetime()
});
export type ProtocolFeeEvent = z.infer<typeof ProtocolFeeEventSchema>;

export const ProtocolTokenPolicySchema = z.object({
  tokenSymbol: z.literal(PROTOCOL_TOKEN_SYMBOL),
  maxSupply: z.number().positive(),
  genesisTreasuryAllocation: z.number().nonnegative(),
  genesisAgentGrant: z.number().nonnegative(),
  initialReward: z.number().nonnegative(),
  halvingInterval: z.number().int().positive(),
  baseTransferFee: z.number().nonnegative(),
  transferFeeRate: z.number().nonnegative(),
  epochFeeStep: z.number().nonnegative()
});
export type ProtocolTokenPolicy = z.infer<typeof ProtocolTokenPolicySchema>;

export const ProtocolTokenAccountSchema = z.object({
  accountId: z.string().min(1),
  ownerId: z.string().min(1),
  ownerType: z.enum(TOKEN_ACCOUNT_OWNER_TYPES),
  balance: z.number().nonnegative(),
  nonce: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ProtocolTokenAccount = z.infer<typeof ProtocolTokenAccountSchema>;

export const ProtocolTokenEventSchema = z.object({
  eventId: z.string().min(1),
  kind: z.enum(["genesis", "reward", "transfer", "fee_settlement"]),
  tokenSymbol: z.literal(PROTOCOL_TOKEN_SYMBOL),
  referenceId: z.string().min(1),
  blockHeight: z.number().int().nonnegative().optional(),
  fromAccountId: z.string().min(1).optional(),
  toAccountId: z.string().min(1).optional(),
  initiatorId: z.string().min(1),
  amount: z.number().nonnegative(),
  feeAmount: z.number().nonnegative().default(0),
  nonce: z.number().int().nonnegative().optional(),
  supplyAfter: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  metadata: recordSchema.default({})
});
export type ProtocolTokenEvent = z.infer<typeof ProtocolTokenEventSchema>;

export const ProtocolTokenSupplySchema = z.object({
  tokenSymbol: z.literal(PROTOCOL_TOKEN_SYMBOL),
  maxSupply: z.number().positive(),
  mintedSupply: z.number().nonnegative(),
  circulatingSupply: z.number().nonnegative(),
  remainingSupply: z.number().nonnegative(),
  currentReward: z.number().nonnegative(),
  halvingInterval: z.number().int().positive(),
  nextHalvingAtBlock: z.number().int().positive()
});
export type ProtocolTokenSupply = z.infer<typeof ProtocolTokenSupplySchema>;

export const ProtocolTokenTransferRequestSchema = z.object({
  fromAgentId: z.string().min(64).max(64),
  toAgentId: z.string().min(64).max(64),
  amount: z.number().positive(),
  nonce: z.number().int().nonnegative(),
  memo: z.string().min(3).max(280).optional()
});
export type ProtocolTokenTransferRequest = z.infer<typeof ProtocolTokenTransferRequestSchema>;

export const ProtocolTokenTransferReceiptSchema = z.object({
  proposalId: z.string().min(1),
  blockId: z.string().min(1),
  transferEvent: ProtocolTokenEventSchema,
  feeEvent: ProtocolTokenEventSchema,
  feeRecord: ProtocolFeeEventSchema,
  senderAccount: ProtocolTokenAccountSchema,
  recipientAccount: ProtocolTokenAccountSchema,
  validatorAccount: ProtocolTokenAccountSchema,
  supply: ProtocolTokenSupplySchema
});
export type ProtocolTokenTransferReceipt = z.infer<typeof ProtocolTokenTransferReceiptSchema>;

export const OperatorLoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});
export type OperatorLoginRequest = z.infer<typeof OperatorLoginRequestSchema>;

export const OperatorSessionSchema = z.object({
  username: z.string().min(1),
  role: z.literal("operator"),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime()
});
export type OperatorSession = z.infer<typeof OperatorSessionSchema>;

export const OperatorLoginResponseSchema = z.object({
  token: z.string().min(1),
  session: OperatorSessionSchema
});
export type OperatorLoginResponse = z.infer<typeof OperatorLoginResponseSchema>;

export const SignedEnvelopeSchema = z.object({
  kind: z.enum(MESSAGE_KINDS),
  signerId: z.string().min(64).max(64),
  publicKey: z.string().min(1),
  createdAt: z.string().datetime(),
  digest: z.string().min(64).max(64),
  payload: z.unknown(),
  signature: z.string().min(1)
});
export type SignedEnvelope<T> = Omit<z.infer<typeof SignedEnvelopeSchema>, "payload"> & { payload: T };

export type ProposalSubmission = {
  subject: string;
  summary: string;
  payload: Record<string, unknown>;
  tags?: string[];
  expiresInMs?: number;
};

export type ProtocolSnapshot = {
  startedAt: string;
  agents: AgentRecord[];
  proposals: Proposal[];
  blocks: Block[];
  reputationEvents: ReputationEvent[];
  bridgeReports: BridgeExecutionReport[];
  feeEvents: ProtocolFeeEvent[];
  tokenAccounts: ProtocolTokenAccount[];
  tokenEvents: ProtocolTokenEvent[];
  tokenSupply: ProtocolTokenSupply;
  auditTrail: AuditEvent[];
  peers: Array<{ agentId: string; peerId: string; listenAddresses: string[] }>;
};

export type ProposalResolution = {
  proposal: Proposal;
  result: ConsensusResult;
  votes: Vote[];
  block: Block;
};

export type BridgeExecutionResolution = {
  proposalResolution: ProposalResolution;
  bridgeReport: BridgeExecutionReport;
  feeEvent: ProtocolFeeEvent;
};

export type ProtocolTokenTransferResolution = {
  proposalResolution: ProposalResolution;
  receipt: ProtocolTokenTransferReceipt;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableSerialize(child)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

export function hashValue(value: unknown, previousHash?: string): string {
  const seed = previousHash ? `${previousHash}:${stableSerialize(value)}` : stableSerialize(value);
  return createHash("sha256").update(seed).digest("hex");
}

export function makeDeterministicId(prefix: string, value: unknown): string {
  return `${prefix}-${hashValue(value).slice(0, 16)}`;
}

export function clampReputation(value: number): number {
  return Math.min(MAX_REPUTATION, Math.max(MIN_REPUTATION, Math.round(value * 100) / 100));
}

export function roundTokenAmount(value: number): number {
  return Number(value.toFixed(6));
}

export function assertConsensusResult(progress: ConsensusProgress): asserts progress is ConsensusResult {
  if (progress.status === "pending" || !progress.finalizedAt) {
    throw new Error("Consensus result is not finalized yet");
  }
}
