import {
  BlockSchema,
  BridgeExecutionReportSchema,
  ProtocolFeeEventSchema,
  ProposalSchema,
  type Block,
  type BridgeExecutionResolution,
  type BridgeRequest,
  type ProtocolSnapshot,
  type ProposalResolution,
  type ProposalSubmission
} from "@ffp/shared-types";

export class ProtocolClient {
  constructor(private readonly baseUrl: string) {}

  async getHealth(): Promise<{ ok: boolean; service: string }> {
    return this.fetchJson<{ ok: boolean; service: string }>("/health");
  }

  async getSnapshot(): Promise<ProtocolSnapshot> {
    return this.fetchJson<ProtocolSnapshot>("/snapshot");
  }

  async listAgents(): Promise<ProtocolSnapshot["agents"]> {
    const snapshot = await this.getSnapshot();
    return snapshot.agents;
  }

  async listProposals(): Promise<ProtocolSnapshot["proposals"]> {
    const proposals = await this.fetchJson<unknown[]>("/proposals");
    return proposals.map((proposal) => ProposalSchema.parse(proposal));
  }

  async getProposal(proposalId: string): Promise<ProposalResolution> {
    return this.fetchJson<ProposalResolution>(`/proposals/${proposalId}`);
  }

  async submitProposal(input: ProposalSubmission): Promise<ProposalResolution> {
    return this.fetchJson<ProposalResolution>("/proposals", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async listBlocks(): Promise<Block[]> {
    const blocks = await this.fetchJson<unknown[]>("/blocks");
    return blocks.map((block) => BlockSchema.parse(block));
  }

  async listBridgeRuns(): Promise<ProtocolSnapshot["bridgeReports"]> {
    return this.fetchJson<ProtocolSnapshot["bridgeReports"]>("/bridges/runs");
  }

  async executeBridge(request: Omit<BridgeRequest, "requestId" | "createdAt">): Promise<BridgeExecutionResolution> {
    return this.fetchJson<BridgeExecutionResolution>("/bridges/execute", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }

  async listFees() {
    const fees = await this.fetchJson<unknown[]>("/fees");
    return fees.map((event) => ProtocolFeeEventSchema.parse(event));
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      }
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
