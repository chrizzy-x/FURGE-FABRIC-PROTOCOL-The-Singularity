import {
  BridgeAdapterManifestSchema,
  BridgeExecutionReportSchema,
  BridgeRequestSchema,
  BridgeValidationSchema,
  type BridgeAdapterManifest,
  type BridgeExecutionReport,
  type BridgeRecovery,
  type BridgeRequest,
  type BridgeValidation,
  type ConsensusResult,
  makeDeterministicId,
  nowIso
} from "@ffp/shared-types";

export interface BridgeAdapter {
  readonly manifest: BridgeAdapterManifest;
  validateExternal(request: BridgeRequest): BridgeValidation;
  syncFromService(request: BridgeRequest): Promise<Record<string, unknown>>;
  syncToService(request: BridgeRequest): Promise<Record<string, unknown>>;
  handleFailure(error: unknown, request: BridgeRequest): BridgeRecovery;
}

export class BridgeRegistry {
  private readonly adapters = new Map<string, BridgeAdapter>();
  private readonly reports: BridgeExecutionReport[] = [];

  register(adapter: BridgeAdapter): void {
    const manifest = BridgeAdapterManifestSchema.parse(adapter.manifest);
    this.adapters.set(manifest.adapterId, adapter);
  }

  listAdapters(): BridgeAdapterManifest[] {
    return Array.from(this.adapters.values()).map((adapter) => adapter.manifest);
  }

  listReports(): BridgeExecutionReport[] {
    return [...this.reports];
  }

  getAdapter(adapterId: string): BridgeAdapter {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Unknown bridge adapter ${adapterId}`);
    }
    return adapter;
  }

  async executeWithConsensus(request: BridgeRequest, consensus: ConsensusResult): Promise<BridgeExecutionReport> {
    const parsedRequest = BridgeRequestSchema.parse(request);
    const adapter = this.getAdapter(parsedRequest.adapterId);
    const validation = BridgeValidationSchema.parse(adapter.validateExternal(parsedRequest));

    if (consensus.status !== "accepted") {
      const report = BridgeExecutionReportSchema.parse({
        runId: makeDeterministicId("bridge", `${parsedRequest.requestId}:blocked`),
        adapterId: parsedRequest.adapterId,
        requestId: parsedRequest.requestId,
        status: "failed",
        validation,
        response: {},
        recovery: {
          attempted: false,
          summary: "Consensus did not accept the bridge request.",
          payload: {}
        },
        createdAt: nowIso(),
        consensusStatus: consensus.status
      });
      this.reports.push(report);
      return report;
    }

    if (!validation.valid) {
      const report = BridgeExecutionReportSchema.parse({
        runId: makeDeterministicId("bridge", `${parsedRequest.requestId}:invalid`),
        adapterId: parsedRequest.adapterId,
        requestId: parsedRequest.requestId,
        status: "failed",
        validation,
        response: {},
        recovery: {
          attempted: false,
          summary: "Bridge payload failed adapter validation.",
          payload: { reasons: validation.reasons }
        },
        createdAt: nowIso(),
        consensusStatus: consensus.status
      });
      this.reports.push(report);
      return report;
    }

    try {
      const response = adapter.manifest.direction === "ingress"
        ? await adapter.syncFromService(parsedRequest)
        : await adapter.syncToService(parsedRequest);
      const report = BridgeExecutionReportSchema.parse({
        runId: makeDeterministicId("bridge", `${parsedRequest.requestId}:executed`),
        adapterId: parsedRequest.adapterId,
        requestId: parsedRequest.requestId,
        status: "executed",
        validation,
        response,
        createdAt: nowIso(),
        consensusStatus: consensus.status
      });
      this.reports.push(report);
      return report;
    } catch (error) {
      const recovery = adapter.handleFailure(error, parsedRequest);
      const report = BridgeExecutionReportSchema.parse({
        runId: makeDeterministicId("bridge", `${parsedRequest.requestId}:recovered`),
        adapterId: parsedRequest.adapterId,
        requestId: parsedRequest.requestId,
        status: recovery.attempted ? "recovered" : "failed",
        validation,
        response: {},
        recovery,
        createdAt: nowIso(),
        consensusStatus: consensus.status
      });
      this.reports.push(report);
      return report;
    }
  }

  importReport(report: BridgeExecutionReport): void {
    this.reports.push(BridgeExecutionReportSchema.parse(report));
  }
}

export class LoopbackBridgeAdapter implements BridgeAdapter {
  readonly manifest: BridgeAdapterManifest = {
    adapterId: "loopback-mailbox",
    version: "1.0.0",
    direction: "bidirectional",
    supportedOperations: ["sync-inbox", "send-message"],
    description: "Deterministic bridge that normalizes mailbox-style payloads for local consensus tests."
  };

  validateExternal(request: BridgeRequest): BridgeValidation {
    const subject = request.payload.subject;
    const address = request.payload.address;
    const valid = typeof subject === "string" && subject.length >= 3 && typeof address === "string" && address.includes("@");
    return {
      valid,
      reasons: valid ? [] : ["Payload must include a subject and RFC-like address."],
      normalizedPayload: valid
        ? {
            address: String(address).toLowerCase(),
            subject: subject,
            body: String(request.payload.body ?? "")
          }
        : undefined
    };
  }

  async syncFromService(request: BridgeRequest): Promise<Record<string, unknown>> {
    return {
      source: "loopback",
      operation: request.operation,
      mailbox: request.payload.address,
      accepted: true,
      normalizedAt: nowIso()
    };
  }

  async syncToService(request: BridgeRequest): Promise<Record<string, unknown>> {
    return {
      destination: "loopback",
      operation: request.operation,
      delivered: true,
      envelopeDigest: makeDeterministicId("mail", request.payload)
    };
  }

  handleFailure(error: unknown, request: BridgeRequest): BridgeRecovery {
    return {
      attempted: true,
      summary: error instanceof Error ? error.message : "Bridge execution failed and was converted into a deterministic recovery report.",
      payload: {
        adapterId: request.adapterId,
        requestId: request.requestId
      }
    };
  }
}
