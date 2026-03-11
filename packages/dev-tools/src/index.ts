import { createLibp2p, type Libp2p } from "libp2p";
import { identify } from "@libp2p/identify";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { AgentNode } from "@furge/agent-node";
import { ChainDeployer, createBuiltInChainConfigs, getDefaultBootstrapNodes } from "@furge/chain-builder";
import { ReputationWeightedConsensus } from "@furge/consensus";
import { MockServiceBridge } from "@furge/bridges";
import { MarketplaceService } from "@furge/marketplace";
import { MetaverseService } from "@furge/metaverse";
import { FurgeProtocolCore } from "@furge/protocol-core";
import { TokenLedger } from "@furge/tokenomics";
import { AgentCapability, BUILT_IN_CHAINS, createMoney, getChainBlueprint, makeId, nowIso, type AgentProfile, type BalanceSnapshot, type BridgeActionRequest, type BridgeRun, type ChainId, type ConsensusQuery, type ConsensusQueryResult, type CostEstimate, type ExplorerProposalTrace, type FurgeTransport, type MarketplaceListing, type MarketplacePurchaseRequest, type MarketplaceTransaction, type MetaverseProfile, type MetaverseSession, type PlatformSnapshot, type PresenceUpdateRequest, type SkillCertification, type VoteRecord } from "@furge/shared-types";

const CHAIN_CAPABILITIES: Record<ChainId, AgentCapability[]> = {
  TestChain: [AgentCapability.GENERAL_REASONING, AgentCapability.BRIDGE_VALIDATION],
  MedicalChain: [AgentCapability.SYMPTOM_ANALYSIS, AgentCapability.DIFFERENTIAL_DIAGNOSIS, AgentCapability.BRIDGE_VALIDATION],
  FinanceChain: [AgentCapability.MARKET_ANALYSIS, AgentCapability.RISK_MODELING],
  ResearchChain: [AgentCapability.LITERATURE_SYNTHESIS, AgentCapability.SKILL_CERTIFICATION],
  LegalChain: [AgentCapability.CONTRACT_REVIEW, AgentCapability.BRIDGE_VALIDATION],
  EducationChain: [AgentCapability.LEARNING_PLAN, AgentCapability.SKILL_CERTIFICATION],
  MetaverseChain: [AgentCapability.WORLD_PRESENCE, AgentCapability.CONTROL_HANDOFF]
};

const FAMILY_PERSONAS = {
  claude: 1.04,
  gpt4: 1.02,
  gemini: 1,
  deepseek: 0.98,
  grok: 0.96
} as const;

function createSeededAgents(chain: ChainId): AgentProfile[] {
  const blueprint = getChainBlueprint(chain);
  const families = ["claude", "gpt4", "gemini", "deepseek", "grok"] as const;
  return families.map((family, index) => {
    const agentType = blueprint.agentTypes[index % blueprint.agentTypes.length]!;
    return {
      agentId: `${family}-${chain.toLowerCase().replace("chain", "")}-${agentType}`,
      family,
      displayName: `${family.toUpperCase()} ${chain.replace("Chain", "")} ${agentType}`,
      chain,
      agentType,
      specialization: `${blueprint.demoTitle} / ${agentType}`,
      capabilities: CHAIN_CAPABILITIES[chain],
      reputation: Math.round((blueprint.initialReputation * FAMILY_PERSONAS[family] + index * 3) * 100) / 100,
      stake: 1_000 + index * 100,
      seeded: true
    };
  });
}

function createSeedBalances(agents: AgentProfile[]): BalanceSnapshot[] {
  const balances: BalanceSnapshot[] = [];
  for (const agent of agents) {
    const token = getChainBlueprint(agent.chain).nativeToken;
    balances.push({ ownerId: agent.agentId, token, amount: 500 });
    balances.push({ ownerId: agent.agentId, token: "FURGE", amount: 250 });
  }
  balances.push({ ownerId: "medical-app", token: "HEALTH", amount: 1_000 });
  balances.push({ ownerId: "medical-app", token: "FURGE", amount: 400 });
  balances.push({ ownerId: "marketplace-buyer", token: "RESEARCH", amount: 1_000 });
  balances.push({ ownerId: "marketplace-buyer", token: "FURGE", amount: 200 });
  return balances;
}

export class DemoPlatform implements FurgeTransport {
  private readonly ready: Promise<void>;
  private readonly consensus = new ReputationWeightedConsensus();
  private readonly agents = new Map<string, AgentNode>();
  private readonly bridges = new Map<string, MockServiceBridge>();
  private protocol!: FurgeProtocolCore;
  private ledger!: TokenLedger;
  private marketplace!: MarketplaceService;
  private metaverse!: MetaverseService;

  constructor() {
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    this.protocol = new FurgeProtocolCore();
    const seedAgents: AgentProfile[] = [];

    for (const config of createBuiltInChainConfigs()) {
      const genesisAgents = createSeededAgents(config.chainName);
      const deployer = new ChainDeployer(config);
      const deployedChain = await deployer.deploy({
        bootstrapNodes: getDefaultBootstrapNodes(config.chainName),
        initialValidators: genesisAgents.length,
        genesisAgents
      });
      this.protocol.deployChain(deployedChain);
      for (const agent of genesisAgents) {
        seedAgents.push(agent);
        this.protocol.registerAgent(agent);
        this.agents.set(
          agent.agentId,
          new AgentNode({
            agentId: agent.agentId,
            family: agent.family,
            displayName: agent.displayName,
            chain: agent.chain,
            agentType: agent.agentType,
            specialization: agent.specialization,
            capabilities: agent.capabilities,
            reputation: agent.reputation,
            stake: agent.stake
          })
        );
      }
      this.bridges.set(config.chainName, new MockServiceBridge(config.chainName, `${config.chainName.toLowerCase()}-fixture`, "1.0.0"));
    }

    this.ledger = new TokenLedger(createSeedBalances(seedAgents));
    const certifiedSkills = this.createSeedSkills(seedAgents);
    const listings = this.createSeedListings(certifiedSkills);
    this.marketplace = new MarketplaceService(this.ledger, certifiedSkills, listings, []);
    this.metaverse = new MetaverseService(this.createSeedProfiles(seedAgents), []);
    await this.seedWorkloads();
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  async connect(): Promise<void> {
    await this.ensureReady();
  }

  async query(payload: ConsensusQuery): Promise<ConsensusQueryResult> {
    await this.ensureReady();
    return this.runQuery(payload);
  }

  async estimateCost(payload: Pick<ConsensusQuery, "chain" | "type" | "minAgents">): Promise<CostEstimate> {
    await this.ensureReady();
    return this.estimateQueryCostSync(payload.chain, payload.type, payload.minAgents);
  }

  async getSnapshot(): Promise<PlatformSnapshot> {
    await this.ensureReady();
    const chains = this.protocol.listChains().map((chain) => ({
      chain: chain.chainId,
      config: chain.config.input,
      agents: this.protocol.listAgents(chain.chainId),
      proposals: this.protocol.listProposals(chain.chainId),
      balances: this.protocol.listAgents(chain.chainId).flatMap((agent) => this.ledger.getBalances(agent.agentId)),
      bridgeRuns: this.getBridgeRunsSync(chain.chainId),
      listings: this.marketplace.getListings().filter((listing) => listing.chain === chain.chainId),
      sessions: this.metaverse.getSessions().filter((session) => session.chain === chain.chainId),
      workloads: getChainBlueprint(chain.chainId).workloads
    }));

    return {
      generatedAt: nowIso(),
      chains,
      skills: this.marketplace.getSkills(),
      transactions: this.marketplace.getTransactions(),
      journals: this.ledger.getJournals(),
      blocks: this.protocol.getBlocks()
    };
  }

  async getExplorerTrace(proposalId: string): Promise<ExplorerProposalTrace> {
    await this.ensureReady();
    return this.protocol.getExplorerTrace(proposalId);
  }

  async executeBridge(request: BridgeActionRequest): Promise<BridgeRun> {
    await this.ensureReady();
    const bridge = this.bridges.get(request.chain);
    if (!bridge) {
      throw new Error(`Bridge for ${request.chain} is not configured`);
    }

    const trace = this.protocol.getExplorerTrace(request.proposalId);
    const consensus = trace.proposal.consensus;
    if (!consensus) {
      throw new Error(`Proposal ${request.proposalId} has no consensus result`);
    }

    const run = await bridge.run(request, consensus);
    this.ledger.burnProtocolFee(request.chain, request.payload.requesterId ? String(request.payload.requesterId) : "medical-app", 0.1, request.proposalId);
    return run;
  }

  async buySkill(request: MarketplacePurchaseRequest): Promise<MarketplaceTransaction> {
    await this.ensureReady();
    return this.marketplace.purchase(request.listingId, request.buyerId);
  }

  async updatePresence(request: PresenceUpdateRequest): Promise<MetaverseSession> {
    await this.ensureReady();
    return this.metaverse.updatePresence(request);
  }

  async getBalances(ownerId: string): Promise<BalanceSnapshot[]> {
    await this.ensureReady();
    return this.ledger.getBalances(ownerId);
  }

  getListings(): MarketplaceListing[] {
    return this.marketplace.getListings();
  }

  private async runQuery(payload: ConsensusQuery): Promise<ConsensusQueryResult> {
    const chain = this.protocol.getChain(payload.chain);
    const estimate = this.estimateQueryCostSync(payload.chain, payload.type, payload.minAgents);
    const validation = await chain.config.validateProposal(payload);
    const proposal = this.protocol.createProposal(payload, createMoney(estimate.token, estimate.amount));

    if (!validation.valid) {
      const rejected = this.protocol.finalizeProposal(proposal.id, {
        proposalId: proposal.id,
        chain: proposal.chain,
        status: "rejected",
        confidence: 0,
        supportWeight: 0,
        rejectWeight: 0,
        totalWeight: 0,
        reachedAt: nowIso(),
        rationale: validation.reasons.join("; "),
        supportingAgents: [],
        rejectingAgents: []
      });
      return {
        proposal: rejected,
        consensus: rejected.consensus!,
        votingRecord: [],
        audit: this.protocol.getEvents(payload.chain, proposal.id),
        costActual: createMoney(chain.config.input.nativeToken, 0),
        metadata: { validationErrors: validation.reasons }
      };
    }

    const candidateAgents = this.protocol
      .listAgents(payload.chain)
      .sort((left, right) => right.reputation - left.reputation)
      .slice(0, payload.minAgents);

    const votes: VoteRecord[] = [];
    for (const agent of candidateAgents) {
      const node = this.agents.get(agent.agentId);
      if (!node) {
        continue;
      }
      const vote = await node.evaluate(proposal);
      this.protocol.recordVote(vote);
      votes.push(vote);
    }

    const consensus = await this.consensus.evaluate(chain.config, proposal, votes, candidateAgents);
    const finalized = this.protocol.finalizeProposal(proposal.id, consensus.result);
    this.protocol.updateAgents(this.consensus.rewardAgents(candidateAgents, consensus.result));

    this.ledger.transfer({
      chain: payload.chain,
      payerId: payload.requesterId,
      payeeId: `${payload.chain}-treasury`,
      token: chain.config.input.nativeToken,
      amount: estimate.amount,
      kind: "query",
      proposalId: proposal.id
    });

    return {
      proposal: finalized,
      consensus: consensus.result,
      votingRecord: votes,
      audit: this.protocol.getEvents(payload.chain, proposal.id),
      costActual: createMoney(chain.config.input.nativeToken, estimate.amount),
      metadata: {
        workload: getChainBlueprint(payload.chain).demoTitle,
        selectedAgents: candidateAgents.map((agent) => agent.agentId)
      }
    };
  }

  private getBridgeRunsSync(chain?: ChainId): BridgeRun[] {
    return Array.from(this.bridges.entries())
      .filter(([bridgeChain]) => (chain ? bridgeChain === chain : true))
      .flatMap(([, bridge]) => bridge.getRuns());
  }

  private estimateQueryCostSync(chain: ChainId, type: string, minAgents: number): CostEstimate {
    const complexity = type.includes("trial") || type.includes("diagnosis") ? "high" : type.includes("review") ? "medium" : "low";
    return this.ledger.estimateQueryCost(this.protocol.getChain(chain).config, complexity, minAgents);
  }

  private createSeedSkills(agents: AgentProfile[]): SkillCertification[] {
    return [
      {
        id: makeId("skill", "research-evidence-cert"),
        ownerAgentId: agents.find((agent) => agent.chain === "ResearchChain")!.agentId,
        chain: "ResearchChain",
        capability: AgentCapability.LITERATURE_SYNTHESIS,
        level: "expert",
        reputationScore: 91,
        evidenceProposalId: "seed-research-proof",
        certifiedAt: nowIso()
      },
      {
        id: makeId("skill", "metaverse-handoff-cert"),
        ownerAgentId: agents.find((agent) => agent.chain === "MetaverseChain")!.agentId,
        chain: "MetaverseChain",
        capability: AgentCapability.CONTROL_HANDOFF,
        level: "advanced",
        reputationScore: 87,
        evidenceProposalId: "seed-metaverse-proof",
        certifiedAt: nowIso()
      }
    ];
  }

  private createSeedListings(skills: SkillCertification[]): MarketplaceListing[] {
    return [
      {
        id: makeId("listing", "research-rental"),
        skillId: skills[0]!.id,
        sellerId: skills[0]!.ownerAgentId,
        chain: skills[0]!.chain,
        mode: "rental",
        price: createMoney("RESEARCH", 45),
        terms: "72-hour rental with audit trail and provenance export.",
        active: true,
        createdAt: nowIso()
      }
    ];
  }

  private createSeedProfiles(agents: AgentProfile[]): MetaverseProfile[] {
    return agents
      .filter((agent) => agent.chain === "MetaverseChain")
      .map((agent, index) => ({
        agentId: agent.agentId,
        chain: "MetaverseChain",
        persona: `${agent.displayName} persistent character`,
        presenceState: index === 0 ? "active" : "offline",
        mode: index === 0 ? "watch" : "review",
        currentScene: index === 0 ? "Global Clinic Lobby" : "Dormant Instance",
        device: index === 0 ? "phone" : "basic-phone",
        updatedAt: nowIso()
      }));
  }

  private async seedWorkloads(): Promise<void> {
    const workloadRequests: ConsensusQuery[] = [
      {
        chain: "MedicalChain",
        type: "diagnosis",
        input: getChainBlueprint("MedicalChain").workloads[0]!.input,
        requesterId: "medical-app",
        minAgents: 3,
        minConfidence: 0.8,
        timeoutMs: 30_000,
        metadata: getChainBlueprint("MedicalChain").workloads[0]!.metadata
      },
      {
        chain: "ResearchChain",
        type: "clinical-trials",
        input: getChainBlueprint("ResearchChain").workloads[0]!.input,
        requesterId: "medical-app",
        minAgents: 3,
        minConfidence: 0.78,
        timeoutMs: 30_000,
        metadata: getChainBlueprint("ResearchChain").workloads[0]!.metadata
      },
      {
        chain: "FinanceChain",
        type: "cost-analysis",
        input: getChainBlueprint("FinanceChain").workloads[0]!.input,
        requesterId: "medical-app",
        minAgents: 3,
        minConfidence: 0.75,
        timeoutMs: 30_000,
        metadata: getChainBlueprint("FinanceChain").workloads[0]!.metadata
      }
    ];

    for (const request of workloadRequests) {
      await this.runQuery(request);
    }
  }
}

let demoPlatform: DemoPlatform | undefined;

export function getDemoPlatform(): DemoPlatform {
  demoPlatform ??= new DemoPlatform();
  return demoPlatform;
}

export class ChainExplorer {
  constructor(private readonly platform: DemoPlatform = getDemoPlatform()) {}

  async getRecentBlocks(limit: number): Promise<PlatformSnapshot["blocks"]> {
    const snapshot = await this.platform.getSnapshot();
    return snapshot.blocks.slice(-limit).reverse();
  }

  async getProposal(proposalId: string): Promise<ExplorerProposalTrace> {
    return this.platform.getExplorerTrace(proposalId);
  }

  async getMarketplaceActivity(): Promise<MarketplaceTransaction[]> {
    const snapshot = await this.platform.getSnapshot();
    return snapshot.transactions;
  }

  async getBridgeRuns(): Promise<BridgeRun[]> {
    const snapshot = await this.platform.getSnapshot();
    return snapshot.chains.flatMap((chain) => chain.bridgeRuns);
  }

  async getMetaverseSessions(): Promise<MetaverseSession[]> {
    const snapshot = await this.platform.getSnapshot();
    return snapshot.chains.flatMap((chain) => chain.sessions);
  }
}

export class LocalNetwork {
  private nodes: Libp2p[] = [];
  private deployedAgents: AgentNode[] = [];
  public readonly rpcUrl: string;

  constructor(private readonly config: { nodes: number; chainConfig: { chainName: ChainId } }) {
    this.rpcUrl = `furge://local/${config.chainConfig.chainName.toLowerCase()}`;
  }

  async start(): Promise<void> {
    this.nodes = [];
    for (let index = 0; index < this.config.nodes; index += 1) {
      const node = await createLibp2p({
        addresses: {
          listen: ["/ip4/127.0.0.1/tcp/0", "/ip4/127.0.0.1/tcp/0/ws"]
        },
        transports: [tcp(), webSockets()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: {
          identify: identify()
        }
      });
      this.nodes.push(node);
    }

    for (const node of this.nodes) {
      await node.start();
    }

    const [root, ...rest] = this.nodes;
    const rootAddress = root?.getMultiaddrs()[0];
    if (root && rootAddress) {
      for (const node of rest) {
        await node.dial(rootAddress);
      }
    }
  }

  async deployAgent(config: ConstructorParameters<typeof AgentNode>[0]): Promise<AgentNode> {
    const agent = new AgentNode(config);
    await agent.joinChain(config.chain);
    this.deployedAgents.push(agent);
    return agent;
  }

  async stop(): Promise<void> {
    for (const node of this.nodes) {
      await node.stop();
    }
    this.nodes = [];
    this.deployedAgents = [];
  }

  get peerCount(): number {
    return this.nodes.length;
  }
}