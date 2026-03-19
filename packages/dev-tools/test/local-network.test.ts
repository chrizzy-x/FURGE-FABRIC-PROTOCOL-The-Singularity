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
  test("bootstraps five nodes, seeds $FURGE, and finalizes a proposal into an immutable block", async () => {
    const resolution = await network.submitProposal({
      subject: "Reference network bootstrap",
      summary: "Prove proposal, votes, and block finalization over libp2p.",
      payload: { action: "bootstrap" },
      tags: ["consensus", "network"],
      expiresInMs: 6_000
    });

    expect(network.getNodes()).toHaveLength(5);
    expect(network.getSnapshot().peers).toHaveLength(5);
    expect(network.getSnapshot().tokenAccounts.length).toBeGreaterThan(0);
    expect(network.getSnapshot().tokenSupply.mintedSupply).toBeGreaterThan(0);
    expect(resolution.result.status).toMatch(/accepted|rejected/);
    expect(network.getSnapshot().blocks.length).toBeGreaterThan(0);
  });

  test("executes a bridge request and records protocol fees", async () => {
    const requesterId = network.getSnapshot().agents[1]!.agentId;
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
    expect(network.listTokenEvents().some((event) => event.kind === "fee_settlement")).toBe(true);
  });

  test("settles deterministic token transfers", async () => {
    const [validator, sender, recipient] = network.getSnapshot().agents;
    const before = network.getSnapshot();
    const senderAccount = before.tokenAccounts.find((account) => account.ownerId === sender!.agentId);

    const resolution = await network.transferTokens({
      fromAgentId: sender!.agentId,
      toAgentId: recipient!.agentId,
      amount: 25,
      nonce: senderAccount!.nonce,
      memo: "local network transfer"
    });

    const after = network.getSnapshot();
    expect(resolution.proposalResolution.result.status).toBe("accepted");
    expect(after.tokenAccounts.find((account) => account.ownerId === recipient!.agentId)?.balance).toBeGreaterThan(
      before.tokenAccounts.find((account) => account.ownerId === recipient!.agentId)!.balance
    );
    expect(after.tokenAccounts.find((account) => account.ownerId === validator!.agentId)?.balance).toBeGreaterThan(
      before.tokenAccounts.find((account) => account.ownerId === validator!.agentId)!.balance
    );
  });
});

const persistenceStoreFactory = (): ProtocolRuntimeStore | undefined => createProtocolRuntimeStoreFromEnv();

describe.runIf(Boolean(process.env.DATABASE_URL))("durable runtime persistence", () => {
  test("restores finalized protocol and token state after restart", async () => {
    const cleanupStore = persistenceStoreFactory();
    await cleanupStore?.connect();
    await cleanupStore?.clearRuntimeState();
    await cleanupStore?.disconnect();

    const firstStore = persistenceStoreFactory();
    const firstRun = await LocalNetwork.bootstrap({ persistence: firstStore });
    const senderAccount = firstRun.getSnapshot().tokenAccounts.find((account) => account.ownerId === firstRun.getSnapshot().agents[1]!.agentId);
    const proposal = await firstRun.submitProposal({
      subject: "Persistence recovery",
      summary: "Persist a finalized coordination proposal for restart hydration.",
      payload: { action: "persist" },
      tags: ["coordination", "audit", "network"],
      expiresInMs: 6_000
    });

    await firstRun.transferTokens({
      fromAgentId: firstRun.getSnapshot().agents[1]!.agentId,
      toAgentId: firstRun.getSnapshot().agents[2]!.agentId,
      amount: 10,
      nonce: senderAccount!.nonce,
      memo: "persisted transfer"
    });

    await firstRun.executeBridge({
      adapterId: "loopback-mailbox",
      operation: "send-message",
      payload: {
        address: "ops@furge.local",
        subject: "Persistence recovery",
        body: "Persist bridge and fee artifacts across restarts"
      },
      requestedBy: firstRun.getSnapshot().agents[1]!.agentId
    });

    const beforeStop = firstRun.getSnapshot();
    await firstRun.stop();

    const secondRun = await LocalNetwork.bootstrap({ persistence: persistenceStoreFactory() });
    const restored = secondRun.getSnapshot();

    expect(restored.proposals.map((entry) => entry.proposalId)).toContain(proposal.proposal.proposalId);
    expect(restored.blocks.length).toBe(beforeStop.blocks.length);
    expect(restored.bridgeReports.length).toBe(beforeStop.bridgeReports.length);
    expect(restored.feeEvents.length).toBe(beforeStop.feeEvents.length);
    expect(restored.tokenEvents.length).toBe(beforeStop.tokenEvents.length);
    expect(restored.tokenSupply.mintedSupply).toBe(beforeStop.tokenSupply.mintedSupply);
    expect(restored.auditTrail.length).toBe(beforeStop.auditTrail.length);

    await secondRun.stop();
    const finalCleanupStore = persistenceStoreFactory();
    await finalCleanupStore?.connect();
    await finalCleanupStore?.clearRuntimeState();
    await finalCleanupStore?.disconnect();
  });
});
