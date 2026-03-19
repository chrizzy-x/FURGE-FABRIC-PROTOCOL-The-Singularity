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
  test("exposes public protocol routes and protects operator actions", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    const tokenSupply = await app.inject({ method: "GET", url: "/token/supply" });
    expect(tokenSupply.statusCode).toBe(200);
    expect(JSON.parse(tokenSupply.body).mintedSupply).toBeGreaterThan(0);

    const accounts = await app.inject({ method: "GET", url: "/token/accounts" });
    const parsedAccounts = JSON.parse(accounts.body);
    expect(accounts.statusCode).toBe(200);
    expect(parsedAccounts.length).toBeGreaterThan(0);

    const unauthorizedProposal = await app.inject({
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
    expect(unauthorizedProposal.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/auth/operator/login",
      payload: {
        username: "operator",
        password: "operator"
      }
    });
    expect(login.statusCode).toBe(200);
    const token = JSON.parse(login.body).token as string;
    expect(token.length).toBeGreaterThan(20);

    const me = await app.inject({
      method: "GET",
      url: "/auth/operator/me",
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.body).role).toBe("operator");

    const proposal = await app.inject({
      method: "POST",
      url: "/proposals",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        subject: "API test proposal",
        summary: "Drive the protocol runtime through Fastify.",
        payload: { source: "api" },
        tags: ["coordination", "audit"],
        expiresInMs: 6_000
      }
    });
    expect(proposal.statusCode).toBe(200);

    const transfer = await app.inject({
      method: "POST",
      url: "/token/transfers",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        fromAgentId: parsedAccounts[1].ownerId,
        toAgentId: parsedAccounts[2].ownerId,
        amount: 15,
        nonce: parsedAccounts[1].nonce,
        memo: "API token transfer"
      }
    });
    expect(transfer.statusCode).toBe(200);
    expect(JSON.parse(transfer.body).receipt.transferEvent.kind).toBe("transfer");

    const bridge = await app.inject({
      method: "POST",
      url: "/bridges/execute",
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        adapterId: "loopback-mailbox",
        operation: "send-message",
        payload: {
          address: "ops@furge.local",
          subject: "API bridge",
          body: "Drive the bridge path through Fastify."
        },
        requestedBy: network.getSnapshot().agents[1]!.agentId
      }
    });
    expect(bridge.statusCode).toBe(200);

    const fees = await app.inject({ method: "GET", url: "/fees" });
    expect(fees.statusCode).toBe(200);
    expect(JSON.parse(fees.body).length).toBeGreaterThan(0);

    const tokenEvents = await app.inject({ method: "GET", url: "/token/events" });
    expect(tokenEvents.statusCode).toBe(200);
    expect(JSON.parse(tokenEvents.body).length).toBeGreaterThan(0);
  });
});