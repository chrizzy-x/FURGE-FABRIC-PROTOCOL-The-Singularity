import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { LocalNetwork, ProtocolRuntimeStore, createProtocolRuntimeStoreFromEnv } from "@ffp/dev-tools";

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

const persistenceStoreFactory = (): ProtocolRuntimeStore | undefined => createProtocolRuntimeStoreFromEnv();

describe.runIf(Boolean(process.env.DATABASE_URL))("durable runtime persistence", () => {
  test("restores finalized protocol state after restart", async () => {
    const cleanupStore = persistenceStoreFactory();
    await cleanupStore?.connect();
    await cleanupStore?.clearRuntimeState();
    await cleanupStore?.disconnect();

    const firstStore = persistenceStoreFactory();
    const firstRun = await LocalNetwork.bootstrap({ persistence: firstStore });
    const proposal = await firstRun.submitProposal({
      subject: "Persistence recovery",
      summary: "Persist a finalized coordination proposal for restart hydration.",
      payload: { action: "persist" },
      tags: ["coordination", "audit", "network"],
      expiresInMs: 6_000
    });

    await firstRun.executeBridge({
      adapterId: "loopback-mailbox",
      operation: "send-message",
      payload: {
        address: "ops@furge.local",
        subject: "Persistence recovery",
        body: "Persist bridge and fee artifacts across restarts"
      },
      requestedBy: firstRun.getSnapshot().agents[0].agentId
    });

    const beforeStop = firstRun.getSnapshot();
    await firstRun.stop();

    const secondRun = await LocalNetwork.bootstrap({ persistence: persistenceStoreFactory() });
    const restored = secondRun.getSnapshot();

    expect(restored.proposals.map((entry) => entry.proposalId)).toContain(proposal.proposal.proposalId);
    expect(restored.blocks.length).toBe(beforeStop.blocks.length);
    expect(restored.bridgeReports.length).toBe(beforeStop.bridgeReports.length);
    expect(restored.feeEvents.length).toBe(beforeStop.feeEvents.length);
    expect(restored.auditTrail.length).toBe(beforeStop.auditTrail.length);

    await secondRun.stop();
    const finalCleanupStore = persistenceStoreFactory();
    await finalCleanupStore?.connect();
    await finalCleanupStore?.clearRuntimeState();
    await finalCleanupStore?.disconnect();
  });
});
