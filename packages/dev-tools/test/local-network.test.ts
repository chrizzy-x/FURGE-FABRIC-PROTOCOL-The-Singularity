import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { LocalNetwork } from "@ffp/dev-tools";

let network: LocalNetwork;

beforeAll(async () => {
  network = await LocalNetwork.bootstrap();
});

afterAll(async () => {
  if (network) {
    await network.stop();
  }
});

describe("local reference network", () => {
  test("bootstraps five nodes and finalizes a proposal into an immutable block", async () => {
    const resolution = await network.submitProposal({
      subject: "Reference network bootstrap",
      summary: "Prove proposal, votes, and block finalization over libp2p.",
      payload: { action: "bootstrap" },
      tags: ["consensus", "network"],
      expiresInMs: 6_000
    });

    expect(network.getNodes()).toHaveLength(5);
    expect(network.getSnapshot().peers).toHaveLength(5);
    expect(resolution.result.status).toMatch(/accepted|rejected/);
    expect(network.getSnapshot().blocks.length).toBeGreaterThan(0);
  });

  test("executes a bridge request and records protocol fees", async () => {
    const requesterId = network.getSnapshot().agents[0].agentId;
    const resolution = await network.executeBridge({
      adapterId: "loopback-mailbox",
      operation: "send-message",
      payload: {
        address: "ops@furge.local",
        subject: "Bridge execution",
        body: "Testing bridge propagation"
      },
      requestedBy: requesterId
    });

    expect(resolution.bridgeReport.status).toBe("executed");
    expect(network.listFees().length).toBeGreaterThan(0);
  });
});
