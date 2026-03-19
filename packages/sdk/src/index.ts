import {
  BlockSchema,
  BridgeExecutionReportSchema,
  OperatorLoginResponseSchema,
  OperatorSessionSchema,
  ProtocolFeeEventSchema,
  ProtocolTokenAccountSchema,
  ProtocolTokenEventSchema,
  ProtocolTokenSupplySchema,
  type Block,
  type BridgeExecutionResolution,
  type BridgeRequest,
  type OperatorLoginResponse,
  type OperatorSession,
  type ProtocolSnapshot,
  type ProposalResolution,
  type ProposalSubmission,
  type ProtocolTokenTransferRequest,
  type ProtocolTokenTransferResolution
} from "@ffp/shared-types";

export class ProtocolClient {
  private operatorToken?: string;

  constructor(private readonly baseUrl: string) {}

  setOperatorToken(token?: string): void {
    this.operatorToken = token;
  }

  async loginOperator(username: string, password: string): Promise<OperatorLoginResponse> {
    const response = await this.fetchJson<unknown>("/auth/operator/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    const parsed = OperatorLoginResponseSchema.parse(response);
    this.operatorToken = parsed.token;
    return parsed;
  }

  async getOperatorSession(): Promise<OperatorSession> {
    const response = await this.fetchJson<unknown>("/auth/operator/me", undefined, true);
    return OperatorSessionSchema.parse(response);
  }

  async getHealth(): Promise<{ ok: boolean; service: string; persistence: string }> {
    return this.fetchJson<{ ok: boolean; service: string; persistence: string }>("/health");
  }

  async getSnapshot(): Promise<ProtocolSnapshot> {
    return this.fetchJson<ProtocolSnapshot>("/snapshot");
  }

  async listAgents(): Promise<ProtocolSnapshot["agents"]> {
    const snapshot = await this.getSnapshot();
    return snapshot.agents;
  }

  async listProposals(): Promise<ProtocolSnapshot["proposals"]> {
    return this.fetchJson<ProtocolSnapshot["proposals"]>("/proposals");
  }

  async getProposal(proposalId: string): Promise<ProposalResolution> {
    return this.fetchJson<ProposalResolution>(`/proposals/${proposalId}`);
  }

  async submitProposal(input: ProposalSubmission): Promise<ProposalResolution> {
    return this.fetchJson<ProposalResolution>(
      "/proposals",
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      true
    );
  }

  async listBlocks(): Promise<Block[]> {
    const blocks = await this.fetchJson<unknown[]>("/blocks");
    return blocks.map((block) => BlockSchema.parse(block));
  }

  async listBridgeRuns(): Promise<ProtocolSnapshot["bridgeReports"]> {
    return this.fetchJson<ProtocolSnapshot["bridgeReports"]>("/bridges/runs");
  }

  async executeBridge(request: Omit<BridgeRequest, "requestId" | "createdAt">): Promise<BridgeExecutionResolution> {
    return this.fetchJson<BridgeExecutionResolution>(
      "/bridges/execute",
      {
        method: "POST",
        body: JSON.stringify(request)
      },
      true
    );
  }

  async listFees() {
    const fees = await this.fetchJson<unknown[]>("/fees");
    return fees.map((event) => ProtocolFeeEventSchema.parse(event));
  }

  async getTokenSupply() {
    const supply = await this.fetchJson<unknown>("/token/supply");
    return ProtocolTokenSupplySchema.parse(supply);
  }

  async listTokenAccounts() {
    const accounts = await this.fetchJson<unknown[]>("/token/accounts");
    return accounts.map((account) => ProtocolTokenAccountSchema.parse(account));
  }

  async getTokenAccount(ownerId: string) {
    const account = await this.fetchJson<unknown>(`/token/accounts/${ownerId}`);
    return ProtocolTokenAccountSchema.parse(account);
  }

  async listTokenEvents() {
    const events = await this.fetchJson<unknown[]>("/token/events");
    return events.map((event) => ProtocolTokenEventSchema.parse(event));
  }

  async transferTokens(request: ProtocolTokenTransferRequest): Promise<ProtocolTokenTransferResolution> {
    return this.fetchJson<ProtocolTokenTransferResolution>(
      "/token/transfers",
      {
        method: "POST",
        body: JSON.stringify(request)
      },
      true
    );
  }

  private async fetchJson<T>(path: string, init?: RequestInit, requiresAuth = false): Promise<T> {
    const headers = new Headers(init?.headers ?? {});
    headers.set("content-type", "application/json");

    if (requiresAuth) {
      if (!this.operatorToken) {
        throw new Error(`ProtocolClient request for ${path} requires an operator token`);
      }
      headers.set("authorization", `Bearer ${this.operatorToken}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      throw new Error(`ProtocolClient request failed with ${response.status}`);
    }

    const payload = (await response.json()) as T & { bridgeReport?: unknown };
    if (path.startsWith("/bridges/execute") && payload.bridgeReport) {
      BridgeExecutionReportSchema.parse(payload.bridgeReport);
    }
    return payload;
  }
}