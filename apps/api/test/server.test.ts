import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildServer } from "../src/server";
import { LocalNetwork } from "@ffp/dev-tools";

let network: LocalNetwork;
let app: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  network = await LocalNetwork.bootstrap();
  app = await buildServer({ network });
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
  if (network) {
    await network.stop();
  }
});

describe("api server", () => {
  test("exposes health, proposal, bridge, and fee routes", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    const proposal = await app.inject({
      method: "POST",
      url: "/proposals",
      payload: {
        subject: "API test proposal",
        summary: "Drive the protocol runtime through Fastify.",
        payload: { source: "api" },
        tags: ["coordination", "audit"],
        expiresInMs: 6_000
      }
    });
    expect(proposal.statusCode).toBe(200);

    const bridge = await app.inject({
      method: "POST",
      url: "/bridges/execute",
      payload: {
        adapterId: "loopback-mailbox",
        operation: "send-message",
        payload: {
          address: "ops@furge.local",
          subject: "API bridge",
          body: "Drive the bridge path through Fastify."
        },
        requestedBy: network.getSnapshot().agents[0].agentId
      }
    });
    expect(bridge.statusCode).toBe(200);

    const fees = await app.inject({ method: "GET", url: "/fees" });
    expect(fees.statusCode).toBe(200);
    expect(JSON.parse(fees.body).length).toBeGreaterThan(0);
  });
});
