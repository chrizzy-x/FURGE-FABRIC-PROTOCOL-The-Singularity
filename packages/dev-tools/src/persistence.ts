import { Prisma, PrismaClient } from "@prisma/client";
import { createClient, type RedisClientType } from "redis";
import { AgentIdentity, type AgentIdentityImportInput } from "@ffp/protocol-core";
import {
  AgentRecordSchema,
  AuditEventSchema,
  BlockSchema,
  BridgeExecutionReportSchema,
  ProtocolFeeEventSchema,
  ProposalSchema,
  ReputationEventSchema,
  type AgentCapability,
  type ModelFamily,
  type ProtocolSnapshot
} from "@ffp/shared-types";

const SNAPSHOT_CACHE_KEY = "ffp:runtime:snapshot";
const RUNTIME_STATE_ID = "reference-local-network";

export type ProtocolRuntimeStoreOptions = {
  databaseUrl?: string;
  redisUrl?: string;
};

export type PersistedRuntimeSnapshot = Omit<ProtocolSnapshot, "peers">;

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class ProtocolRuntimeStore {
  private prisma?: PrismaClient;
  private redis?: RedisClientType;

  constructor(private readonly options: ProtocolRuntimeStoreOptions = {}) {}

  get enabled(): boolean {
    return Boolean(this.options.databaseUrl);
  }

  async connect(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    process.env.DATABASE_URL = this.options.databaseUrl;

    if (!this.prisma) {
      this.prisma = new PrismaClient();
    }

    await this.prisma.$connect();

    if (this.options.redisUrl && !this.redis) {
      this.redis = createClient({ url: this.options.redisUrl });
      await this.redis.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis?.isOpen) {
      await this.redis.quit();
    }
    this.redis = undefined;

    if (this.prisma) {
      await this.prisma.$disconnect();
    }
    this.prisma = undefined;
  }

  async clearRuntimeState(): Promise<void> {
    if (!this.prisma) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.protocolFeeEvent.deleteMany();
      await tx.bridgeRun.deleteMany();
      await tx.auditEvent.deleteMany();
      await tx.reputationEvent.deleteMany();
      await tx.block.deleteMany();
      await tx.vote.deleteMany();
      await tx.proposal.deleteMany();
      await tx.agentRecord.deleteMany();
      await tx.runtimeState.deleteMany();
    });

    if (this.redis?.isOpen) {
      await this.redis.del(SNAPSHOT_CACHE_KEY);
    }
  }

  async loadNodeIdentities(): Promise<AgentIdentity[] | null> {
    if (!this.prisma) {
      return null;
    }

    const rows = await this.prisma.nodeIdentity.findMany({ orderBy: { slot: "asc" } });
    if (rows.length === 0) {
      return null;
    }

    return rows.map((row) => {
      const input: AgentIdentityImportInput = {
        label: row.label,
        modelFamily: row.modelFamily as ModelFamily,
        capabilities: row.capabilities as AgentCapability[],
        publicKeyPem: row.publicKey,
        privateKeyPem: row.privateKey,
        createdAt: row.createdAt.toISOString(),
        reputation: 100
      };
      return AgentIdentity.import(input);
    });
  }

  async saveNodeIdentities(identities: AgentIdentity[]): Promise<void> {
    if (!this.prisma) {
      return;
    }

    for (const [slot, identity] of identities.entries()) {
      const material = identity.exportKeyMaterial();
      await this.prisma.nodeIdentity.upsert({
        where: { slot },
        update: {
          agentId: material.agentId,
          label: material.label,
          modelFamily: material.modelFamily,
          capabilities: toInputJson(material.capabilities),
          publicKey: material.publicKeyPem,
          privateKey: material.privateKeyPem,
          createdAt: new Date(material.createdAt)
        },
        create: {
          slot,
          agentId: material.agentId,
          label: material.label,
          modelFamily: material.modelFamily,
          capabilities: toInputJson(material.capabilities),
          publicKey: material.publicKeyPem,
          privateKey: material.privateKeyPem,
          createdAt: new Date(material.createdAt)
        }
      });
    }
  }

  async loadRuntimeSnapshot(): Promise<PersistedRuntimeSnapshot | null> {
    if (!this.prisma) {
      return null;
    }

    const [runtimeState, agents, proposals, blocks, reputationEvents, bridgeRuns, feeEvents, auditEvents] = await Promise.all([
      this.prisma.runtimeState.findUnique({ where: { id: RUNTIME_STATE_ID } }),
      this.prisma.agentRecord.findMany({ orderBy: { createdAt: "asc" } }),
      this.prisma.proposal.findMany({ orderBy: { createdAt: "asc" } }),
      this.prisma.block.findMany({ orderBy: { height: "asc" } }),
      this.prisma.reputationEvent.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      this.prisma.bridgeRun.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      this.prisma.protocolFeeEvent.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      this.prisma.auditEvent.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
    ]);

    if (!runtimeState && agents.length === 0 && proposals.length === 0 && blocks.length === 0) {
      return null;
    }

    const snapshot: PersistedRuntimeSnapshot = {
      startedAt: runtimeState?.startedAt.toISOString() ?? new Date().toISOString(),
      agents: agents.map((row) =>
        AgentRecordSchema.parse({
          agentId: row.id,
          label: row.label,
          modelFamily: row.modelFamily,
          publicKey: row.publicKey,
          capabilities: row.capabilities,
          reputation: row.reputation,
          createdAt: row.createdAt.toISOString()
        })
      ),
      proposals: proposals.map((row) =>
        ProposalSchema.parse({
          proposalId: row.id,
          proposerId: row.proposerId,
          subject: row.subject,
          summary: row.summary,
          payload: row.payload,
          tags: row.tags,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          status: row.status
        })
      ),
      blocks: blocks.map((row) => BlockSchema.parse(row.payload)),
      reputationEvents: reputationEvents.map((row) =>
        ReputationEventSchema.parse({
          eventId: row.id,
          agentId: row.agentId,
          proposalId: row.proposalId,
          delta: row.delta,
          before: row.before,
          after: row.after,
          reason: row.reason,
          createdAt: row.createdAt.toISOString()
        })
      ),
      bridgeReports: bridgeRuns.map((row) =>
        BridgeExecutionReportSchema.parse({
          runId: row.id,
          adapterId: row.adapterId,
          requestId: row.requestId,
          status: row.status,
          validation: row.validation,
          response: row.response,
          recovery: row.recovery ?? undefined,
          createdAt: row.createdAt.toISOString(),
          consensusStatus: row.consensusStatus
        })
      ),
      feeEvents: feeEvents.map((row) =>
        ProtocolFeeEventSchema.parse({
          feeEventId: row.id,
          tokenSymbol: row.tokenSymbol,
          amount: row.amount,
          kind: row.kind,
          payerId: row.payerId,
          payeeId: row.payeeId ?? undefined,
          referenceId: row.referenceId,
          createdAt: row.createdAt.toISOString()
        })
      ),
      auditTrail: auditEvents.map((row) =>
        AuditEventSchema.parse({
          eventId: row.id,
          type: row.type,
          actorId: row.actorId,
          referenceId: row.referenceId,
          createdAt: row.createdAt.toISOString(),
          payload: row.payload
        })
      )
    };

    await this.cacheSnapshot(snapshot);
    return snapshot;
  }

  async saveRuntimeSnapshot(snapshot: PersistedRuntimeSnapshot): Promise<void> {
    if (!this.prisma) {
      return;
    }

    const votes = snapshot.blocks.flatMap((block) => block.votes);

    await this.prisma.$transaction(async (tx) => {
      await tx.protocolFeeEvent.deleteMany();
      await tx.bridgeRun.deleteMany();
      await tx.auditEvent.deleteMany();
      await tx.reputationEvent.deleteMany();
      await tx.block.deleteMany();
      await tx.vote.deleteMany();
      await tx.proposal.deleteMany();
      await tx.agentRecord.deleteMany();

      await tx.runtimeState.upsert({
        where: { id: RUNTIME_STATE_ID },
        update: { startedAt: new Date(snapshot.startedAt) },
        create: { id: RUNTIME_STATE_ID, startedAt: new Date(snapshot.startedAt) }
      });

      if (snapshot.agents.length > 0) {
        await tx.agentRecord.createMany({
          data: snapshot.agents.map((agent) => ({
            id: agent.agentId,
            label: agent.label,
            modelFamily: agent.modelFamily,
            publicKey: agent.publicKey,
            capabilities: toInputJson(agent.capabilities),
            reputation: agent.reputation,
            createdAt: new Date(agent.createdAt)
          }))
        });
      }

      if (snapshot.proposals.length > 0) {
        await tx.proposal.createMany({
          data: snapshot.proposals.map((proposal) => ({
            id: proposal.proposalId,
            proposerId: proposal.proposerId,
            subject: proposal.subject,
            summary: proposal.summary,
            payload: toInputJson(proposal.payload),
            tags: toInputJson(proposal.tags),
            createdAt: new Date(proposal.createdAt),
            expiresAt: new Date(proposal.expiresAt),
            status: proposal.status
          }))
        });
      }

      if (votes.length > 0) {
        await tx.vote.createMany({
          data: votes.map((vote) => ({
            id: `${vote.proposalId}:${vote.voterId}`,
            proposalId: vote.proposalId,
            voterId: vote.voterId,
            decision: vote.decision,
            confidence: vote.confidence,
            reason: vote.reason,
            createdAt: new Date(vote.createdAt)
          }))
        });
      }

      if (snapshot.blocks.length > 0) {
        await tx.block.createMany({
          data: snapshot.blocks.map((block) => ({
            id: block.blockId,
            height: block.height,
            previousHash: block.previousHash,
            hash: block.hash,
            createdAt: new Date(block.createdAt),
            proposalId: block.proposal.proposalId,
            payload: toInputJson(block)
          }))
        });
      }

      if (snapshot.reputationEvents.length > 0) {
        await tx.reputationEvent.createMany({
          data: snapshot.reputationEvents.map((event) => ({
            id: event.eventId,
            agentId: event.agentId,
            proposalId: event.proposalId,
            delta: event.delta,
            before: event.before,
            after: event.after,
            reason: event.reason,
            createdAt: new Date(event.createdAt)
          }))
        });
      }

      if (snapshot.bridgeReports.length > 0) {
        await tx.bridgeRun.createMany({
          data: snapshot.bridgeReports.map((report) => ({
            id: report.runId,
            adapterId: report.adapterId,
            requestId: report.requestId,
            status: report.status,
            validation: toInputJson(report.validation),
            response: toInputJson(report.response),
            recovery: report.recovery ? toInputJson(report.recovery) : Prisma.JsonNull,
            consensusStatus: report.consensusStatus,
            createdAt: new Date(report.createdAt)
          }))
        });
      }

      if (snapshot.feeEvents.length > 0) {
        await tx.protocolFeeEvent.createMany({
          data: snapshot.feeEvents.map((event) => ({
            id: event.feeEventId,
            tokenSymbol: event.tokenSymbol,
            amount: event.amount,
            kind: event.kind,
            payerId: event.payerId,
            payeeId: event.payeeId,
            referenceId: event.referenceId,
            createdAt: new Date(event.createdAt)
          }))
        });
      }

      if (snapshot.auditTrail.length > 0) {
        await tx.auditEvent.createMany({
          data: snapshot.auditTrail.map((event) => ({
            id: event.eventId,
            type: event.type,
            actorId: event.actorId,
            referenceId: event.referenceId,
            createdAt: new Date(event.createdAt),
            payload: toInputJson(event.payload)
          }))
        });
      }
    });

    await this.cacheSnapshot(snapshot);
  }

  async readCachedSnapshot(): Promise<PersistedRuntimeSnapshot | null> {
    if (!this.redis?.isOpen) {
      return null;
    }

    const raw = await this.redis.get(SNAPSHOT_CACHE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PersistedRuntimeSnapshot;
  }

  async cacheSnapshot(snapshot: PersistedRuntimeSnapshot): Promise<void> {
    if (!this.redis?.isOpen) {
      return;
    }

    await this.redis.set(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
  }
}

export function createProtocolRuntimeStoreFromEnv(env: NodeJS.ProcessEnv = process.env): ProtocolRuntimeStore | undefined {
  if (!env.DATABASE_URL) {
    return undefined;
  }

  return new ProtocolRuntimeStore({
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL
  });
}
