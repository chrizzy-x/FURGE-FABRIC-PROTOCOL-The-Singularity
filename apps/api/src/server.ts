import Fastify from "fastify";
import cors from "@fastify/cors";
import { ConsensusQuerySchema } from "@furge/shared-types";
import { getDemoPlatform } from "@furge/dev-tools";

export async function buildServer() {
  const app = Fastify({ logger: false });
  const platform = getDemoPlatform();

  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, service: "furge-api" }));

  app.get("/snapshot", async () => platform.getSnapshot());

  app.post("/query", async (request) => {
    const payload = ConsensusQuerySchema.parse(request.body);
    return platform.query(payload);
  });

  app.post("/estimate", async (request) => {
    const payload = ConsensusQuerySchema.pick({ chain: true, type: true, minAgents: true }).parse(request.body);
    return platform.estimateCost(payload);
  });

  app.get<{ Params: { proposalId: string } }>("/explorer/:proposalId", async (request) => {
    return platform.getExplorerTrace(request.params.proposalId);
  });

  app.get("/bridges", async () => {
    const snapshot = await platform.getSnapshot();
    return snapshot.chains.flatMap((chain) => chain.bridgeRuns);
  });

  app.post("/bridges/run", async (request) => {
    return platform.executeBridge(request.body as never);
  });

  app.get("/marketplace/listings", async () => {
    const snapshot = await platform.getSnapshot();
    return snapshot.chains.flatMap((chain) => chain.listings);
  });

  app.post("/marketplace/purchase", async (request) => {
    return platform.buySkill(request.body as never);
  });

  app.get("/metaverse/sessions", async () => {
    const snapshot = await platform.getSnapshot();
    return snapshot.chains.flatMap((chain) => chain.sessions);
  });

  app.post("/metaverse/presence", async (request) => {
    return platform.updatePresence(request.body as never);
  });

  app.get<{ Params: { ownerId: string } }>("/balances/:ownerId", async (request) => {
    return platform.getBalances(request.params.ownerId);
  });

  return app;
}

async function start() {
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 3100);
  await app.listen({ port, host: "127.0.0.1" });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void start();
}