import type { BalanceSnapshot, ChainId, ConsensusQuery, ConsensusQueryResult, CostEstimate, ExplorerProposalTrace, FurgeTransport, MarketplacePurchaseRequest, MetaverseSession, PlatformSnapshot, PresenceUpdateRequest } from "@furge/shared-types";

export class ChainClient {
  private connected = false;
  public readonly chainName: ChainId;
  private readonly transport: FurgeTransport;

  constructor(config: { chainName: ChainId; transport: FurgeTransport }) {
    this.chainName = config.chainName;
    this.transport = config.transport;
  }

  async connect(): Promise<void> {
    await this.transport.connect();
    this.connected = true;
  }

  async consensusQuery(payload: Omit<ConsensusQuery, "chain">): Promise<ConsensusQueryResult> {
    if (!this.connected) {
      await this.connect();
    }
    return this.transport.query({ ...payload, chain: this.chainName });
  }

  async estimateQueryCost(payload: Pick<ConsensusQuery, "type" | "minAgents">): Promise<CostEstimate> {
    return this.transport.estimateCost({
      chain: this.chainName,
      type: payload.type,
      minAgents: payload.minAgents
    });
  }

  async getSnapshot(): Promise<PlatformSnapshot> {
    return this.transport.getSnapshot();
  }

  async getExplorerTrace(proposalId: string): Promise<ExplorerProposalTrace> {
    return this.transport.getExplorerTrace(proposalId);
  }

  async getBalances(ownerId: string): Promise<BalanceSnapshot[]> {
    return this.transport.getBalances(ownerId);
  }

  getWallet(ownerId: string): { getBalance(token: string): Promise<number> } {
    return {
      getBalance: async (token: string) => {
        const balances = await this.transport.getBalances(ownerId);
        return balances.find((balance) => balance.token === token)?.amount ?? 0;
      }
    };
  }
}

export class CrossChainBridge {
  constructor(private readonly clients: ChainClient[]) {}

  async coordinatedQuery(input: {
    primary: Omit<ConsensusQuery, "requesterId"> & { requesterId?: string };
    dependencies: Array<Omit<ConsensusQuery, "requesterId"> & { requesterId?: string }>;
  }): Promise<Record<string, ConsensusQueryResult>> {
    const byChain = new Map<ChainId, ChainClient>();
    this.clients.forEach((client) => {
      byChain.set(client.chainName, client);
    });

    const results: Record<string, ConsensusQueryResult> = {};
    const primaryClient = byChain.get(input.primary.chain);
    if (!primaryClient) {
      throw new Error(`Primary client for ${input.primary.chain} is not configured`);
    }

    results[input.primary.chain] = await primaryClient.consensusQuery({
      ...input.primary,
      requesterId: input.primary.requesterId ?? "cross-chain-orchestrator"
    });

    for (const dependency of input.dependencies) {
      const client = byChain.get(dependency.chain);
      if (!client) {
        throw new Error(`Dependency client for ${dependency.chain} is not configured`);
      }
      results[dependency.chain] = await client.consensusQuery({
        ...dependency,
        requesterId: dependency.requesterId ?? input.primary.requesterId ?? "cross-chain-orchestrator"
      });
    }

    return results;
  }
}

export async function executeMarketplacePurchase(transport: FurgeTransport, request: MarketplacePurchaseRequest) {
  return transport.buySkill(request);
}

export async function recordPresence(transport: FurgeTransport, request: PresenceUpdateRequest): Promise<MetaverseSession> {
  return transport.updatePresence(request);
}