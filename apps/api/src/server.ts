import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { createReferenceLocalNetwork, type LocalNetwork } from "@ffp/dev-tools";
import {
  BridgeRequestSchema,
  OperatorLoginRequestSchema,
  ProposalSchema,
  ProtocolTokenTransferRequestSchema,
  type OperatorSession,
  type ProposalSubmission
} from "@ffp/shared-types";
import { OperatorAuthError, createOperatorAuth } from "./auth.js";

export type BuildServerOptions = {
  network?: LocalNetwork;
};

type OperatorRequest = FastifyRequest & {
  operatorSession?: OperatorSession;
};

export async function buildServer(options: BuildServerOptions = {}) {
  const app = Fastify({ logger: false });
  const network = options.network ?? (await createReferenceLocalNetwork());
  const auth = createOperatorAuth();

  await app.register(cors, {
    origin: buildCorsOriginHandler()
  });

  const requireOperator = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const session = auth.authenticate(request.headers.authorization);
      (request as OperatorRequest).operatorSession = session;
    } catch (error) {
      return sendAuthError(reply, error);
    }
  };

  app.get("/health", async () => ({
    ok: true,
    service: "ffp-layer-zero-api",
    persistence: network.isPersistenceEnabled() ? "postgres" : "memory"
  }));

  app.get("/snapshot", async () => network.getSnapshot());

  app.get("/agents", async () => network.getSnapshot().agents);
  app.get("/proposals", async () => network.getSnapshot().proposals);
  app.get("/blocks", async () => network.getSnapshot().blocks);
  app.get("/audit", async () => network.getSnapshot().auditTrail);
  app.get("/reputation", async () => network.getSnapshot().reputationEvents);
  app.get("/bridges/adapters", async () => network.getNodes()[0]?.bridgeRegistry.listAdapters() ?? []);
  app.get("/bridges/runs", async () => network.listBridgeReports());
  app.get("/fees", async () => network.listFees());
  app.get("/token/supply", async () => network.getTokenSupply());
  app.get("/token/accounts", async () => network.listTokenAccounts());
  app.get("/token/events", async () => network.listTokenEvents());

  app.post("/auth/operator/login", async (request, reply) => {
    try {
      const credentials = OperatorLoginRequestSchema.parse(request.body);
      return auth.login(credentials, request.ip);
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.get("/auth/operator/me", { preHandler: requireOperator }, async (request) => {
    return (request as OperatorRequest).operatorSession;
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

  app.get<{ Params: { ownerId: string } }>("/token/accounts/:ownerId", async (request, reply) => {
    const account = network.listTokenAccounts().find(
      (entry) => entry.ownerId === request.params.ownerId || entry.accountId === request.params.ownerId
    );
    if (!account) {
      return reply.status(404).send({ message: "Token account not found" });
    }
    return account;
  });

  app.post("/proposals", { preHandler: requireOperator }, async (request) => {
    const body = request.body as ProposalSubmission;
    return network.submitProposal(body);
  });

  app.post("/bridges/execute", { preHandler: requireOperator }, async (request) => {
    const body = request.body as Omit<ReturnType<typeof BridgeRequestSchema.parse>, "requestId" | "createdAt">;
    return network.executeBridge(body);
  });

  app.post("/token/transfers", { preHandler: requireOperator }, async (request, reply) => {
    try {
      const body = ProtocolTokenTransferRequestSchema.parse(request.body);
      return await network.transferTokens(body);
    } catch (error) {
      return reply.status(400).send({
        message: error instanceof Error ? error.message : "Token transfer failed"
      });
    }
  });

  app.post("/reset", { preHandler: requireOperator }, async (request, reply) => {
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_PRODUCTION_RESET !== "true") {
      return reply.status(403).send({ message: "Reset is disabled in production" });
    }

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

function buildCorsOriginHandler() {
  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOrigins.length === 0) {
    return process.env.NODE_ENV === "production"
      ? (origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) => callback(null, !origin)
      : true;
  }

  return (origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, configuredOrigins.includes(origin));
  };
}

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof OperatorAuthError) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  if (error instanceof Error) {
    return reply.status(400).send({ message: error.message });
  }

  return reply.status(400).send({ message: "Authentication failed" });
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