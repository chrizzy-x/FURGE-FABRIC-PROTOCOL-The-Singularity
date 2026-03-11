import { createHash } from "node:crypto";
import { z } from "zod";

export const BUILT_IN_CHAINS = [
  "TestChain",
  "MedicalChain",
  "FinanceChain",
  "ResearchChain",
  "LegalChain",
  "EducationChain",
  "MetaverseChain"
] as const;

export type ChainId = (typeof BUILT_IN_CHAINS)[number];
export type ProposalStatus = "pending" | "accepted" | "rejected" | "timeout";
export type VoteDecision = "support" | "reject" | "abstain";
export type BridgeDirection = "inbound" | "outbound";
export type SessionMode = "watch" | "takeover" | "hybrid" | "review";
export type ListingMode = "transfer" | "rental" | "subscription" | "license" | "bundle";

export enum AgentCapability {
  GENERAL_REASONING = "GENERAL_REASONING",
  SYMPTOM_ANALYSIS = "SYMPTOM_ANALYSIS",
  DIFFERENTIAL_DIAGNOSIS = "DIFFERENTIAL_DIAGNOSIS",
  MARKET_ANALYSIS = "MARKET_ANALYSIS",
  RISK_MODELING = "RISK_MODELING",
  LITERATURE_SYNTHESIS = "LITERATURE_SYNTHESIS",
  CONTRACT_REVIEW = "CONTRACT_REVIEW",
  LEARNING_PLAN = "LEARNING_PLAN",
  WORLD_PRESENCE = "WORLD_PRESENCE",
  CONTROL_HANDOFF = "CONTROL_HANDOFF",
  BRIDGE_VALIDATION = "BRIDGE_VALIDATION",
  SKILL_CERTIFICATION = "SKILL_CERTIFICATION"
}

export const MODEL_FAMILIES = ["claude", "gpt4", "gemini", "deepseek", "grok"] as const;
export type ModelFamily = (typeof MODEL_FAMILIES)[number];

export const ChainConfigSchema = z.object({
  chainName: z.enum(BUILT_IN_CHAINS),
  description: z.string(),
  consensusType: z.literal("reputation-weighted"),
  finalityThreshold: z.number().min(0).max(1),
  reputationDecay: z.number().min(0).max(1),
  initialReputation: z.number().positive(),
  nativeToken: z.string().min(2),
  tokenSupply: z.number().positive(),
  agentTypes: z.array(z.string()).min(1),
  validationRules: z.array(z.string()).min(1),
  explorerVisible: z.boolean(),
  bootstrapNodes: z.array(z.string()).default([])
});

export type ChainConfigInput = z.infer<typeof ChainConfigSchema>;

export const ConsensusQuerySchema = z.object({
  chain: z.enum(BUILT_IN_CHAINS),
  type: z.string(),
  input: z.record(z.string(), z.any()),
  requesterId: z.string(),
  minAgents: z.number().int().positive().default(3),
  minConfidence: z.number().min(0).max(1).default(0.75),
  timeoutMs: z.number().int().positive().default(30_000),
  metadata: z.record(z.string(), z.any()).default({})
});

export type ConsensusQuery = z.infer<typeof ConsensusQuerySchema>;

export type ChainWorkload = {
  id: string;
  type: string;
  title: string;
  description: string;
  input: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type ChainBlueprint = ChainConfigInput & {
  demoTitle: string;
  validatorKinds: string[];
  workloads: ChainWorkload[];
};

export type AgentProfile = {
  agentId: string;
  family: ModelFamily;
  displayName: string;
  chain: ChainId;
  agentType: string;
  specialization: string;
  capabilities: AgentCapability[];
  reputation: number;
  stake: number;
  seeded: boolean;
};

export type ProposalRecord = {
  id: string;
  chain: ChainId;
  type: string;
  title: string;
  requesterId: string;
  input: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  confidenceTarget: number;
  finalityThreshold: number;
  estimatedFee: MoneyAmount;
  consensus?: ConsensusResult;
  explorerPath: string;
};

export type VoteRecord = {
  proposalId: string;
  agentId: string;
  decision: VoteDecision;
  confidence: number;
  reasoning: string;
  weight: number;
  timestamp: string;
};

export type ConsensusResult = {
  proposalId: string;
  chain: ChainId;
  status: Exclude<ProposalStatus, "pending">;
  confidence: number;
  supportWeight: number;
  rejectWeight: number;
  totalWeight: number;
  reachedAt: string;
  rationale: string;
  supportingAgents: string[];
  rejectingAgents: string[];
};

export type AuditEvent = {
  id: string;
  chain: ChainId;
  type: string;
  proposalId?: string;
  actorId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  index: number;
  previousHash: string;
  hash: string;
};

export type AuditBlock = {
  id: string;
  chain: ChainId;
  height: number;
  proposalIds: string[];
  consensusReached: boolean;
  hash: string;
  previousHash: string;
  createdAt: string;
};

export type MoneyAmount = {
  token: string;
  amount: number;
};

export type FeeJournalEntry = {
  id: string;
  chain: ChainId;
  proposalId?: string;
  payerId: string;
  payeeId: string;
  token: string;
  amount: number;
  kind: "query" | "bridge" | "marketplace" | "settlement" | "protocol-burn";
  timestamp: string;
};

export type BalanceSnapshot = {
  ownerId: string;
  token: string;
  amount: number;
};

export type BridgeRun = {
  id: string;
  chain: ChainId;
  serviceId: string;
  direction: BridgeDirection;
  proposalId: string;
  status: "validated" | "executed" | "failed" | "recovered";
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  recovery: Record<string, unknown> | null;
  createdAt: string;
};

export type SkillCertification = {
  id: string;
  ownerAgentId: string;
  chain: ChainId;
  capability: AgentCapability;
  level: "foundation" | "advanced" | "expert";
  reputationScore: number;
  evidenceProposalId: string;
  certifiedAt: string;
};

export type MarketplaceListing = {
  id: string;
  skillId: string;
  sellerId: string;
  chain: ChainId;
  mode: ListingMode;
  price: MoneyAmount;
  terms: string;
  active: boolean;
  createdAt: string;
};

export type MarketplaceTransaction = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  token: string;
  amount: number;
  mode: ListingMode;
  completedAt: string;
};

export type MetaverseProfile = {
  agentId: string;
  chain: ChainId;
  persona: string;
  presenceState: "offline" | "active" | "review";
  mode: SessionMode;
  currentScene: string;
  device: "phone" | "tv" | "vr" | "basic-phone";
  updatedAt: string;
};

export type MetaverseSession = {
  id: string;
  agentId: string;
  chain: ChainId;
  scene: string;
  mode: SessionMode;
  approved: boolean;
  notes: string;
  startedAt: string;
  endedAt?: string;
};

export type ExplorerProposalTrace = {
  proposal: ProposalRecord;
  votes: VoteRecord[];
  events: AuditEvent[];
  blocks: AuditBlock[];
};

export type ChainSnapshot = {
  chain: ChainId;
  config: ChainConfigInput;
  agents: AgentProfile[];
  proposals: ProposalRecord[];
  balances: BalanceSnapshot[];
  bridgeRuns: BridgeRun[];
  listings: MarketplaceListing[];
  sessions: MetaverseSession[];
  workloads: ChainWorkload[];
};

export type PlatformSnapshot = {
  generatedAt: string;
  chains: ChainSnapshot[];
  skills: SkillCertification[];
  transactions: MarketplaceTransaction[];
  journals: FeeJournalEntry[];
  blocks: AuditBlock[];
};

export type ConsensusQueryResult = {
  proposal: ProposalRecord;
  consensus: ConsensusResult;
  votingRecord: VoteRecord[];
  audit: AuditEvent[];
  costActual: MoneyAmount;
  metadata: Record<string, unknown>;
};

export type CostEstimate = {
  chain: ChainId;
  token: string;
  amount: number;
  breakdown: Array<{ label: string; amount: number }>;
};

export type WalletView = {
  getBalance(token: string): Promise<number>;
};

export type MarketplacePurchaseRequest = {
  listingId: string;
  buyerId: string;
};

export type PresenceUpdateRequest = {
  agentId: string;
  scene: string;
  mode: SessionMode;
  device: MetaverseProfile["device"];
  approved: boolean;
  notes: string;
};

export type BridgeActionRequest = {
  chain: ChainId;
  proposalId: string;
  serviceId: string;
  direction: BridgeDirection;
  payload: Record<string, unknown>;
};

export interface FurgeTransport {
  connect(): Promise<void>;
  query(payload: ConsensusQuery): Promise<ConsensusQueryResult>;
  estimateCost(payload: Pick<ConsensusQuery, "chain" | "type" | "minAgents">): Promise<CostEstimate>;
  getSnapshot(): Promise<PlatformSnapshot>;
  getExplorerTrace(proposalId: string): Promise<ExplorerProposalTrace>;
  executeBridge(request: BridgeActionRequest): Promise<BridgeRun>;
  buySkill(request: MarketplacePurchaseRequest): Promise<MarketplaceTransaction>;
  updatePresence(request: PresenceUpdateRequest): Promise<MetaverseSession>;
  getBalances(ownerId: string): Promise<BalanceSnapshot[]>;
}

const CHAIN_BLUEPRINTS: Record<ChainId, ChainBlueprint> = {
  TestChain: {
    chainName: "TestChain",
    description: "Protocol sanity chain for smoke tests and deployment verification.",
    consensusType: "reputation-weighted",
    finalityThreshold: 0.6,
    reputationDecay: 0.98,
    initialReputation: 100,
    nativeToken: "TEST",
    tokenSupply: 1_000_000,
    agentTypes: ["general", "validator", "bridge"],
    validationRules: ["basic-structure", "minimum-confidence-60"],
    explorerVisible: true,
    bootstrapNodes: [],
    demoTitle: "Protocol sanity query",
    validatorKinds: ["general", "validator"],
    workloads: [
      {
        id: "test-sanity",
        type: "protocol-check",
        title: "Verify protocol baseline",
        description: "Simple deterministic consensus flow used for smoke tests.",
        input: { prompt: "Confirm the local network health." },
        metadata: { category: "sanity", importance: "baseline" }
      }
    ]
  },
  MedicalChain: {
    chainName: "MedicalChain",
    description: "Consensus-driven diagnostics and treatment planning.",
    consensusType: "reputation-weighted",
    finalityThreshold: 0.67,
    reputationDecay: 0.95,
    initialReputation: 120,
    nativeToken: "HEALTH",
    tokenSupply: 1_000_000_000,
    agentTypes: ["diagnostic", "research", "treatment-planning", "pharmacy"],
    validationRules: ["require-citations", "minimum-confidence-80", "recent-evidence"],
    explorerVisible: true,
    bootstrapNodes: [],
    demoTitle: "Diagnosis and treatment workflow",
    validatorKinds: ["diagnostic", "research", "treatment-planning"],
    workloads: [
      {
        id: "medical-diagnosis",
        type: "diagnosis",
        title: "Autoimmune triage review",
        description: "Evaluates symptoms, recent citations, and treatment options.",
        input: { symptoms: ["fever", "fatigue", "joint pain"], duration: "5 days", age: 45 },
        metadata: { citations: ["WHO-2024", "Lancet-2025", "NEJM-2024"], confidence: 0.86 }
      }
    ]
  },
  FinanceChain: {
    chainName: "FinanceChain",
    description: "Autonomous market analysis and risk synthesis.",
    consensusType: "reputation-weighted",
    finalityThreshold: 0.68,
    reputationDecay: 0.96,
    initialReputation: 115,
    nativeToken: "FINANCE",
    tokenSupply: 1_000_000_000,
    agentTypes: ["trading", "risk", "macro", "compliance"],
    validationRules: ["risk-limits", "freshness-24h", "minimum-confidence-75"],
    explorerVisible: true,
    bootstrapNodes: [],
    demoTitle: "Cost and risk analysis",
    validatorKinds: ["trading", "risk", "macro"],
    workloads: [
      {
        id: "finance-cost",
        type: "cost-analysis",
        title: "Treatment cost and exposure review",
        description: "Assesses fees, exposure, and settlement options for a care plan.",
        input: { treatments: ["therapy", "medication"], region: "NG" },
        metadata: { maxDrawdown: 0.12, dataFreshnessHours: 8, confidence: 0.82 }
      }
    ]
  },
  ResearchChain: {
    chainName: "ResearchChain",
    description: "Collaborative scientific evidence and trial discovery.",
    consensusType: "reputation-weighted",
    finalityThreshold: 0.7,
    reputationDecay: 0.96,
    initialReputation: 118,
    nativeToken: "RESEARCH",
    tokenSupply: 1_000_000_000,
    agentTypes: ["literature", "trial", "biostatistics", "review"],
    validationRules: ["require-citations", "reproducible-method", "recent-evidence"],
    explorerVisible: true,
    bootstrapNodes: [],
    demoTitle: "Evidence dependency workflow",
    validatorKinds: ["literature", "trial", "review"],
    workloads: [
      {
        id: "research-trials",
        type: "clinical-trials",
        title: "Trial discovery for chronic inflammation",
        description: "Finds trial matches and summarizes methodology quality.",
        input: { condition: "chronic inflammation", geography: "global" },
        metadata: { citations: ["Cell-2025", "Nature-2024"], methodology: "meta-analysis", confidence: 0.83 }
      }
    ]
  },
  LegalChain: {
    chainName: "LegalChain",
    description: "Contract analysis and compliance review.",
    consensusType: "reputation-weighted",
    finalityThreshold: 0.67,
    reputationDecay: 0.97,
    initialReputation: 112,
    nativeToken: "LAW",
    tokenSupply: 1_000_000_000,
    agentTypes: ["contracts", "compliance", "jurisdiction", "review"],
    validationRules: ["jurisdiction-required", "require-citations", "minimum-confidence-75"],
    explorerVisible: true,
    bootstrapNodes: [],
    demoTitle: "Contract and compliance review",
    validatorKinds: ["contracts", "compliance", "jurisdiction"],
    workloads: [
      {
        id: "legal-contract",
        type: "contract-review",
        title: "Clinical services contract review",
        description: "Checks clause coverage, liability, and jurisdiction fit.",
        input: { contractType: "services", counterparties: 2 },
        metadata: { jurisdiction: "Nigeria", citations: ["Health Act", "NDPR"], confidence: 0.79 }
      }
    ]
  },
  EducationChain: {
    chainName: "EducationChain",
    description: "Virtual classroom participation and learning validation.",
    consensusType: "reputation-weighted",
    finalityThreshold: 0.66,
    reputationDecay: 0.97,
    initialReputation: 108,
    nativeToken: "LEARN",
    tokenSupply: 1_000_000_000,
    agentTypes: ["teacher", "tutor", "assessment", "safety"],
    validationRules: ["curriculum-aligned", "participation-audited", "minimum-confidence-75"],
    explorerVisible: true,
    bootstrapNodes: [],
    demoTitle: "Virtual classroom attendance workflow",
    validatorKinds: ["teacher", "assessment", "safety"],
    workloads: [
      {
        id: "education-classroom",
        type: "attendance-review",
        title: "Remote classroom participation review",
        description: "Tracks lesson participation, grading, and safety context.",
        input: { subject: "Biology", mode: "phone" },
        metadata: { curriculumStandard: "WAEC", participationScore: 0.9, confidence: 0.81 }
      }
    ]
  },
  MetaverseChain: {
    chainName: "MetaverseChain",
    description: "Persistent virtual presence and control handoff.",
    consensusType: "reputation-weighted",
    finalityThreshold: 0.64,
    reputationDecay: 0.99,
    initialReputation: 105,
    nativeToken: "META",
    tokenSupply: 1_000_000_000,
    agentTypes: ["presence", "social", "moderation", "handoff"],
    validationRules: ["consent-required", "session-audited", "minimum-confidence-70"],
    explorerVisible: true,
    bootstrapNodes: [],
    demoTitle: "Live control transfer workflow",
    validatorKinds: ["presence", "moderation", "handoff"],
    workloads: [
      {
        id: "metaverse-handoff",
        type: "presence-update",
        title: "Cross-device control handoff",
        description: "Moves a character from watch mode to active takeover with review history.",
        input: { scene: "Global Clinic Lobby", mode: "watch" },
        metadata: { subjectConsent: true, confidence: 0.77 }
      }
    ]
  }
};

export function getChainBlueprint(chain: ChainId): ChainBlueprint {
  return CHAIN_BLUEPRINTS[chain];
}

export function listChainBlueprints(): ChainBlueprint[] {
  return BUILT_IN_CHAINS.map((chain) => CHAIN_BLUEPRINTS[chain]);
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

export function hashPayload(payload: unknown, previousHash = "GENESIS"): string {
  return createHash("sha256").update(`${previousHash}:${stableStringify(payload)}`).digest("hex");
}

export function makeId(prefix: string, seed: string): string {
  return `${prefix}-${hashPayload(seed).slice(0, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function roundAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function createMoney(token: string, amount: number): MoneyAmount {
  return { token, amount: roundAmount(amount) };
}