import { createMoney, getChainBlueprint, hashPayload, listChainBlueprints, nowIso, type AgentProfile, type ChainBlueprint, type ChainConfigInput, type ChainId, type ConsensusQuery, type ProposalRecord, type VoteRecord } from "@furge/shared-types";

export type RuleValidationResult = {
  valid: boolean;
  reasons: string[];
};

export type ConsensusRuleContext = {
  chain: ChainConfig;
  proposal: ProposalRecord | ConsensusQuery;
  votes?: VoteRecord[];
};

export abstract class ConsensusRule {
  constructor(public readonly id: string, public readonly description: string) {}

  abstract validateProposal(context: ConsensusRuleContext): Promise<RuleValidationResult>;

  scoreVote(vote: VoteRecord): VoteRecord {
    return vote;
  }

  async onEpochClosed(_chain: ChainConfig, _agents: AgentProfile[]): Promise<void> {
    return Promise.resolve();
  }
}

class TagDrivenConsensusRule extends ConsensusRule {
  constructor(private readonly tag: string) {
    super(tag, `Validation rule for ${tag}`);
  }

  override async validateProposal({ proposal }: ConsensusRuleContext): Promise<RuleValidationResult> {
    const metadata = proposal.metadata ?? {};
    const confidence = Number(metadata.confidence ?? proposal.input?.confidence ?? 0.75);
    const citations = Array.isArray(metadata.citations) ? metadata.citations : [];
    const reasons: string[] = [];

    switch (this.tag) {
      case "basic-structure":
        if (!proposal.type) {
          reasons.push("proposal type missing");
        }
        break;
      case "require-citations":
        if (citations.length < 2) {
          reasons.push("at least two citations are required");
        }
        break;
      case "minimum-confidence-80":
        if (confidence < 0.8) {
          reasons.push("confidence below 0.80");
        }
        break;
      case "minimum-confidence-75":
        if (confidence < 0.75) {
          reasons.push("confidence below 0.75");
        }
        break;
      case "minimum-confidence-70":
        if (confidence < 0.7) {
          reasons.push("confidence below 0.70");
        }
        break;
      case "minimum-confidence-60":
        if (confidence < 0.6) {
          reasons.push("confidence below 0.60");
        }
        break;
      case "recent-evidence":
        if (citations.length > 0 && citations.every((citation) => !String(citation).includes("2024") && !String(citation).includes("2025"))) {
          reasons.push("recent evidence is required");
        }
        break;
      case "risk-limits": {
        const drawdown = Number(metadata.maxDrawdown ?? proposal.input?.maxDrawdown ?? 0.1);
        if (drawdown > 0.15) {
          reasons.push("risk drawdown exceeds 15%");
        }
        break;
      }
      case "freshness-24h": {
        const freshness = Number(metadata.dataFreshnessHours ?? 0);
        if (freshness > 24) {
          reasons.push("market data is older than 24 hours");
        }
        break;
      }
      case "reproducible-method":
        if (!metadata.methodology) {
          reasons.push("methodology metadata is required");
        }
        break;
      case "jurisdiction-required":
        if (!metadata.jurisdiction) {
          reasons.push("jurisdiction metadata is required");
        }
        break;
      case "curriculum-aligned":
        if (!metadata.curriculumStandard) {
          reasons.push("curriculum metadata is required");
        }
        break;
      case "participation-audited":
        if (Number(metadata.participationScore ?? 0) < 0.6) {
          reasons.push("participation score below 0.60");
        }
        break;
      case "consent-required":
        if (metadata.subjectConsent === false) {
          reasons.push("subject consent is required");
        }
        break;
      case "session-audited":
        if (!metadata.scene && !proposal.input?.scene) {
          reasons.push("session scene metadata is required");
        }
        break;
      default:
        break;
    }

    return {
      valid: reasons.length === 0,
      reasons
    };
  }
}

export class ChainConfig {
  public readonly rules: ConsensusRule[];
  public readonly explorerVisible: boolean;
  public readonly bootstrapNodes: string[];

  constructor(public readonly input: ChainConfigInput, rules: ConsensusRule[] = []) {
    this.rules = rules;
    this.explorerVisible = input.explorerVisible;
    this.bootstrapNodes = input.bootstrapNodes;
  }

  get chainName(): ChainId {
    return this.input.chainName;
  }

  addConsensusRule(rule: ConsensusRule): this {
    this.rules.push(rule);
    return this;
  }

  async validateProposal(proposal: ProposalRecord | ConsensusQuery): Promise<RuleValidationResult> {
    const results = await Promise.all(this.rules.map((rule) => rule.validateProposal({ chain: this, proposal })));
    const reasons = results.flatMap((result) => result.reasons);
    return {
      valid: reasons.length === 0,
      reasons
    };
  }
}

export type DeployOptions = {
  bootstrapNodes: string[];
  initialValidators: number;
  genesisAgents: AgentProfile[];
};

export type DeployedChain = {
  chainId: ChainId;
  genesisHash: string;
  bootstrapNodes: string[];
  validators: AgentProfile[];
  deployedAt: string;
  config: ChainConfig;
  treasury: ReturnType<typeof createMoney>;
};

export class ChainDeployer {
  constructor(private readonly config: ChainConfig) {}

  async deploy(options: DeployOptions): Promise<DeployedChain> {
    const deployedAt = nowIso();
    const genesisHash = hashPayload({
      chain: this.config.chainName,
      validators: options.genesisAgents.map((agent) => agent.agentId),
      bootstrapNodes: options.bootstrapNodes,
      deployedAt
    });

    return {
      chainId: this.config.chainName,
      genesisHash,
      bootstrapNodes: options.bootstrapNodes,
      validators: options.genesisAgents.slice(0, options.initialValidators),
      deployedAt,
      config: this.config,
      treasury: createMoney(this.config.input.nativeToken, this.config.input.tokenSupply)
    };
  }
}

function createTagRules(input: ChainBlueprint): ConsensusRule[] {
  return input.validationRules.map((tag) => new TagDrivenConsensusRule(tag));
}

export function createChainConfig(chain: ChainId): ChainConfig {
  const blueprint = getChainBlueprint(chain);
  return new ChainConfig(blueprint, createTagRules(blueprint));
}

export function createBuiltInChainConfigs(): ChainConfig[] {
  return listChainBlueprints().map((blueprint) => new ChainConfig(blueprint, createTagRules(blueprint)));
}

export function getDefaultBootstrapNodes(chain: ChainId): string[] {
  return Array.from({ length: 5 }, (_, index) => `furge://${chain.toLowerCase()}-node-${index + 1}.local:90${index}`);
}