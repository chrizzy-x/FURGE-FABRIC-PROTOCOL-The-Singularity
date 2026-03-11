import Fastify from "fastify";
import cors from "@fastify/cors";
import { createReferenceLocalNetwork, type LocalNetwork } from "@ffp/dev-tools";
import { BridgeRequestSchema, ProposalSchema, type ProposalSubmission } from "@ffp/shared-types";

export type BuildServerOptions = {
  network?: LocalNetwork;
};

export async function buildServer(options: BuildServerOptions = {}) {
  const app = Fastify({ logger: false });
  const network = options.network ?? (await createReferenceLocalNetwork());

  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, service: "ffp-layer-zero-api" }));

  app.get("/snapshot", async () => network.getSnapshot());

  app.get("/agents", async () => network.getSnapshot().agents);

  app.get("/proposals", async () => network.getSnapshot().proposals);

  app.post("/proposals", async (request) => {
    const body = request.body as ProposalSubmission;
    return network.submitProposal(body);
  });

  app.get<{ Params: { proposalId: string } }>("/proposals/:proposalId", async (request, reply) => {
    const proposal = network.getSnapshot().proposals.find((entry) => entry.proposalId === request.params.proposalId);
    if (!proposal) {
      return reply.status(404).send({ message: "Proposal not found" });
    }

    const block = network.getSnapshot().blocks.find((entry) => entry.proposal.proposalId === proposal.proposalId);
    const result = block?.result;
    return {
      proposal: ProposalSchema.parse(proposal),
      result,
      votes: block?.votes ?? [],
      block
    };
  });

  app.get("/blocks", async () => network.getSnapshot().blocks);
  app.get("/audit", async () => network.getSnapshot().auditTrail);
  app.get("/reputation", async () => network.getSnapshot().reputationEvents);
  app.get("/bridges/adapters", async () => network.getNodes()[0]?.bridgeRegistry.listAdapters() ?? []);
  app.get("/bridges/runs", async () => network.listBridgeReports());

  app.post("/bridges/execute", async (request) => {
    const body = request.body as Omit<ReturnType<typeof BridgeRequestSchema.parse>, "requestId" | "createdAt">;
    return network.executeBridge(body);
  });

  app.get("/fees", async () => network.listFees());
  app.post("/reset", async () => {
    await network.reset();
    return { ok: true };
  });

  app.addHook("onClose", async () => {
    if (!options.network) {
      await network.stop();
    }
  });

  return app;
}

async function start() {
  const app = await buildServer();
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3100);
  const host = process.env.API_HOST ?? "127.0.0.1";
  await app.listen({ port, host });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void start();
}
