import { describe, expect, test } from "vitest";
import { BridgeRegistry, LoopbackBridgeAdapter } from "@ffp/bridges";

const accepted = {
  proposalId: "proposal-1",
  status: "accepted",
  threshold: 2 / 3,
  eligibleWeight: 500,
  supportWeight: 400,
  rejectWeight: 100,
  abstainWeight: 0,
  missingWeight: 0,
  confidence: 0.84,
  rationale: "Accepted",
  finalizedAt: new Date().toISOString(),
  alignedAgentIds: ["a", "b", "c"],
  opposingAgentIds: ["d"]
} as const;

describe("bridge registry", () => {
  test("validates and executes bridge traffic after accepted consensus", async () => {
    const registry = new BridgeRegistry();
    registry.register(new LoopbackBridgeAdapter());

    const report = await registry.executeWithConsensus(
      {
        requestId: "bridge-1",
        adapterId: "loopback-mailbox",
        operation: "send-message",
        payload: {
          address: "ops@furge.local",
          subject: "Protocol",
          body: "Hello"
        },
        requestedBy: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        createdAt: new Date().toISOString()
      },
      accepted
    );

    expect(report.status).toBe("executed");
    expect(report.validation.valid).toBe(true);
  });

  test("fails invalid payloads before bridge execution", async () => {
    const registry = new BridgeRegistry();
    registry.register(new LoopbackBridgeAdapter());

    const report = await registry.executeWithConsensus(
      {
        requestId: "bridge-2",
        adapterId: "loopback-mailbox",
        operation: "send-message",
        payload: {
          address: "not-an-email",
          subject: "x"
        },
        requestedBy: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        createdAt: new Date().toISOString()
      },
      accepted
    );

    expect(report.status).toBe("failed");
    expect(report.validation.valid).toBe(false);
  });
});
