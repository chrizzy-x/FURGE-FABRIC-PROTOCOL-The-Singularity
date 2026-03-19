import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildServer } from "@ffp/api";
import { LocalNetwork } from "@ffp/dev-tools";
import { ProtocolClient } from "@ffp/sdk";

let network: LocalNetwork;
let app: Awaited<ReturnType<typeof buildServer>>;
let client: ProtocolClient;

beforeAll(async () => {
  network = await LocalNetwork.bootstrap();
  app = await buildServer({ network });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  client = new ProtocolClient(address);
  await client.loginOperator("operator", "operator");
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
  if (network) {
    await network.stop();
  }
});

describe("ProtocolClient", () => {
  test("retrieves health status from the running server", async () => {
    const health = await client.getHealth();
    expect(health.ok).toBe(true);
    expect(health.service).toBe("ffp-layer-zero-api");
  });

  test("retrieves a full protocol snapshot", async () => {
    const snapshot = await client.getSnapshot();
    expect(snapshot.agents).toHaveLength(5);
    expect(snapshot.peers).toHaveLength(5);
    expect(Array.isArray(snapshot.proposals)).toBe(true);
    expect(Array.isArray(snapshot.blocks)).toBe(true);
  });

  test("lists agents from the network", async () => {
    const agents = await client.listAgents();
    expect(agents).toHaveLength(5);
    expect(agents[0].label).toBeTruthy();
    expect(agents[0].agentId).toHaveLength(64);
  });

  test("submits a proposal and receives a finalized resolution", async () => {
    const resolution = await client.submitProposal({
      subject: "SDK client test proposal",
      summary: "Validate the SDK client can submit proposals.",
      payload: { source: "sdk-test" },
      tags: ["coordination", "audit"],
      expiresInMs: 6_000
    });

    expect(resolution.proposal.proposalId).toBeTruthy();
    expect(resolution.result.status).toMatch(/accepted|rejected/);
    expect(resolution.block.blockId).toBeTruthy();
    expect(resolution.votes.length).toBeGreaterThan(0);
  });

  test("lists proposals after submission", async () => {
    const proposals = await client.listProposals();
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0].proposalId).toBeTruthy();
  });

  test("lists blocks after finalization", async () => {
    const blocks = await client.listBlocks();
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].height).toBeGreaterThan(0);
    expect(blocks[0].hash).toHaveLength(64);
  });

  test("executes a bridge request and returns the resolution", async () => {
    const agents = await client.listAgents();
    const resolution = await client.executeBridge({
      adapterId: "loopback-mailbox",
      operation: "send-message",
      payload: {
        address: "sdk@furge.local",
        subject: "SDK bridge test",
        body: "Testing bridge execution via the SDK client."
      },
      requestedBy: agents[0].agentId
    });

    expect(resolution.bridgeReport.status).toBe("executed");
    expect(resolution.feeEvent.amount).toBeGreaterThan(0);
    expect(resolution.feeEvent.tokenSymbol).toBe("$FURGE");
  });

  test("lists fees after bridge execution", async () => {
    const fees = await client.listFees();
    expect(fees.length).toBeGreaterThan(0);
    expect(fees[0].kind).toBe("bridge");
    expect(fees[0].amount).toBeGreaterThan(0);
  });

  test("lists bridge runs after execution", async () => {
    const runs = await client.listBridgeRuns();
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].status).toBe("executed");
  });

  test("throws on non-existent proposal lookup", async () => {
    await expect(client.getProposal("nonexistent-proposal-id")).rejects.toThrow();
  });
});
