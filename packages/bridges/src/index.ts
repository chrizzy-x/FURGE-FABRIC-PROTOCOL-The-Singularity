import { makeId, nowIso, type BridgeActionRequest, type BridgeRun, type ConsensusResult } from "@furge/shared-types";

export type BridgeRecovery = {
  status: "queued" | "replayed" | "manual-review";
  notes: string;
};

export abstract class FurgeBridge {
  constructor(
    public readonly chainId: string,
    public readonly serviceId: string,
    public readonly bridgeVersion: string
  ) {}

  abstract syncFromService(): Promise<Record<string, unknown>>;
  abstract syncToService(action: Record<string, unknown>): Promise<Record<string, unknown>>;
  abstract validateExternal(data: Record<string, unknown>): Promise<ConsensusResult>;
  abstract executeWithConsensus(action: Record<string, unknown>, consensus: ConsensusResult): Promise<Record<string, unknown>>;
  abstract handleFailure(error: Error): Promise<BridgeRecovery>;
}

export class MockServiceBridge extends FurgeBridge {
  private readonly runs: BridgeRun[] = [];

  override async syncFromService(): Promise<Record<string, unknown>> {
    return { source: this.serviceId, syncedAt: nowIso(), status: "ok" };
  }

  override async syncToService(action: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { serviceId: this.serviceId, action, status: "accepted", executedAt: nowIso() };
  }

  override async validateExternal(data: Record<string, unknown>): Promise<ConsensusResult> {
    return {
      proposalId: String(data.proposalId ?? "bridge-validation"),
      chain: this.chainId as ConsensusResult["chain"],
      status: "accepted",
      confidence: 0.88,
      supportWeight: 420,
      rejectWeight: 40,
      totalWeight: 460,
      reachedAt: nowIso(),
      rationale: `External payload for ${this.serviceId} passed deterministic bridge validation.`,
      supportingAgents: ["claude-medical-lead", "gpt4-medical-auditor"],
      rejectingAgents: []
    };
  }

  override async executeWithConsensus(action: Record<string, unknown>, consensus: ConsensusResult): Promise<Record<string, unknown>> {
    if (consensus.status !== "accepted") {
      throw new Error(`Bridge action for ${this.serviceId} cannot execute without accepted consensus.`);
    }
    return this.syncToService(action);
  }

  override async handleFailure(error: Error): Promise<BridgeRecovery> {
    return {
      status: "manual-review",
      notes: `Bridge failure captured for ${this.serviceId}: ${error.message}`
    };
  }

  async run(request: BridgeActionRequest, consensus: ConsensusResult): Promise<BridgeRun> {
    try {
      const response = await this.executeWithConsensus(request.payload, consensus);
      const run: BridgeRun = {
        id: makeId("bridge", `${request.proposalId}:${this.serviceId}:${this.runs.length}`),
        chain: request.chain,
        serviceId: this.serviceId,
        direction: request.direction,
        proposalId: request.proposalId,
        status: "executed",
        request: request.payload,
        response,
        recovery: null,
        createdAt: nowIso()
      };
      this.runs.push(run);
      return run;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      const recovery = await this.handleFailure(failure);
      const run: BridgeRun = {
        id: makeId("bridge", `${request.proposalId}:${this.serviceId}:${this.runs.length}`),
        chain: request.chain,
        serviceId: this.serviceId,
        direction: request.direction,
        proposalId: request.proposalId,
        status: "failed",
        request: request.payload,
        response: {},
        recovery,
        createdAt: nowIso()
      };
      this.runs.push(run);
      return run;
    }
  }

  getRuns(): BridgeRun[] {
    return [...this.runs];
  }
}