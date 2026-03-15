import { describe, expect, test } from "vitest";
import {
  AgentRecordSchema,
  AuditEventSchema,
  BlockSchema,
  BridgeAdapterManifestSchema,
  BridgeExecutionReportSchema,
  BridgeRequestSchema,
  BridgeValidationSchema,
  ConsensusProgressSchema,
  DEFAULT_INITIAL_REPUTATION,
  DEFAULT_THRESHOLD,
  MAX_REPUTATION,
  MIN_REPUTATION,
  PROTOCOL_TOKEN_SYMBOL,
  ProtocolFeeEventSchema,
  ProposalSchema,
  ReputationEventSchema,
  SignedEnvelopeSchema,
  VoteSchema,
  assertConsensusResult,
  clampReputation,
  hashValue,
  makeDeterministicId,
  nowIso,
  stableSerialize
} from "@ffp/shared-types";

const VALID_AGENT_ID = "a".repeat(64);

describe("constants", () => {
  test("defines protocol threshold as two thirds", () => {
    expect(DEFAULT_THRESHOLD).toBeCloseTo(2 / 3, 10);
  });

  test("defines reputation bounds and defaults", () => {
    expect(DEFAULT_INITIAL_REPUTATION).toBe(100);
    expect(MIN_REPUTATION).toBe(0);
    expect(MAX_REPUTATION).toBe(1000);
  });

  test("defines token symbol", () => {
    expect(PROTOCOL_TOKEN_SYMBOL).toBe("$FURGE");
  });
});

describe("utility functions", () => {
  test("nowIso returns a valid ISO 8601 timestamp", () => {
    const iso = nowIso();
    expect(new Date(iso).toISOString()).toBe(iso);
  });

  test("stableSerialize produces deterministic output for objects", () => {
    const a = stableSerialize({ z: 1, a: 2, m: 3 });
    const b = stableSerialize({ a: 2, m: 3, z: 1 });
    expect(a).toBe(b);
  });

  test("stableSerialize handles nested objects", () => {
    const result = stableSerialize({ outer: { b: 2, a: 1 } });
    expect(result).toBe('{"outer":{"a":1,"b":2}}');
  });

  test("stableSerialize handles arrays", () => {
    const result = stableSerialize([3, 1, 2]);
    expect(result).toBe("[3,1,2]");
  });

  test("stableSerialize handles primitives", () => {
    expect(stableSerialize("hello")).toBe('"hello"');
    expect(stableSerialize(42)).toBe("42");
    expect(stableSerialize(true)).toBe("true");
    expect(stableSerialize(null)).toBe("null");
  });

  test("hashValue produces consistent 64-char hex digest", () => {
    const first = hashValue({ key: "value" });
    const second = hashValue({ key: "value" });
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  test("hashValue changes when previous hash is provided", () => {
    const without = hashValue({ key: "value" });
    const with_ = hashValue({ key: "value" }, "previous-hash");
    expect(without).not.toBe(with_);
  });

  test("makeDeterministicId creates prefixed identifiers", () => {
    const id = makeDeterministicId("proposal", { subject: "test" });
    expect(id).toMatch(/^proposal-[a-f0-9]{16}$/);
  });

  test("makeDeterministicId is stable across invocations", () => {
    const a = makeDeterministicId("block", { height: 1 });
    const b = makeDeterministicId("block", { height: 1 });
    expect(a).toBe(b);
  });

  test("clampReputation clamps to valid range", () => {
    expect(clampReputation(-50)).toBe(MIN_REPUTATION);
    expect(clampReputation(2000)).toBe(MAX_REPUTATION);
    expect(clampReputation(500)).toBe(500);
  });

  test("clampReputation rounds to two decimal places", () => {
    expect(clampReputation(100.123)).toBe(100.12);
    expect(clampReputation(100.126)).toBe(100.13);
  });
});

describe("assertConsensusResult", () => {
  test("throws when status is pending", () => {
    expect(() =>
      assertConsensusResult({
        proposalId: "p1",
        status: "pending",
        threshold: 2 / 3,
        eligibleWeight: 300,
        supportWeight: 100,
        rejectWeight: 0,
        abstainWeight: 0,
        missingWeight: 200,
        confidence: 0.5,
        rationale: "Still collecting votes.",
        alignedAgentIds: [],
        opposingAgentIds: []
      })
    ).toThrow("not finalized");
  });

  test("does not throw when status is accepted with finalizedAt", () => {
    expect(() =>
      assertConsensusResult({
        proposalId: "p1",
        status: "accepted",
        threshold: 2 / 3,
        eligibleWeight: 300,
        supportWeight: 200,
        rejectWeight: 100,
        abstainWeight: 0,
        missingWeight: 0,
        confidence: 0.8,
        rationale: "Accepted.",
        finalizedAt: nowIso(),
        alignedAgentIds: ["a"],
        opposingAgentIds: ["b"]
      })
    ).not.toThrow();
  });
});

describe("schema validation", () => {
  test("AgentRecordSchema accepts valid agent records", () => {
    const result = AgentRecordSchema.safeParse({
      agentId: VALID_AGENT_ID,
      label: "Claude Sentinel",
      modelFamily: "claude",
      publicKey: "-----BEGIN PUBLIC KEY-----",
      capabilities: ["audit", "coordination"],
      reputation: 100,
      createdAt: nowIso()
    });
    expect(result.success).toBe(true);
  });

  test("AgentRecordSchema rejects invalid agent ID length", () => {
    const result = AgentRecordSchema.safeParse({
      agentId: "short",
      label: "Agent",
      modelFamily: "claude",
      publicKey: "key",
      capabilities: ["audit"],
      reputation: 100,
      createdAt: nowIso()
    });
    expect(result.success).toBe(false);
  });

  test("AgentRecordSchema rejects reputation above maximum", () => {
    const result = AgentRecordSchema.safeParse({
      agentId: VALID_AGENT_ID,
      label: "Agent",
      modelFamily: "claude",
      publicKey: "key",
      capabilities: ["audit"],
      reputation: 1001,
      createdAt: nowIso()
    });
    expect(result.success).toBe(false);
  });

  test("ProposalSchema accepts valid proposals", () => {
    const result = ProposalSchema.safeParse({
      proposalId: "proposal-abc123",
      proposerId: VALID_AGENT_ID,
      subject: "Protocol bootstrap",
      summary: "Establish the baseline block sequence.",
      payload: { scope: "layer-zero" },
      tags: ["consensus"],
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 5_000).toISOString(),
      status: "pending"
    });
    expect(result.success).toBe(true);
  });

  test("ProposalSchema rejects subject shorter than 3 characters", () => {
    const result = ProposalSchema.safeParse({
      proposalId: "p1",
      proposerId: VALID_AGENT_ID,
      subject: "ab",
      summary: "Too short subject.",
      payload: {},
      createdAt: nowIso(),
      expiresAt: nowIso(),
      status: "pending"
    });
    expect(result.success).toBe(false);
  });

  test("VoteSchema accepts valid vote records", () => {
    const result = VoteSchema.safeParse({
      proposalId: "proposal-1",
      voterId: VALID_AGENT_ID,
      decision: "support",
      confidence: 0.85,
      reason: "Aligned with protocol goals.",
      createdAt: nowIso()
    });
    expect(result.success).toBe(true);
  });

  test("VoteSchema rejects confidence outside 0-1 range", () => {
    const result = VoteSchema.safeParse({
      proposalId: "proposal-1",
      voterId: VALID_AGENT_ID,
      decision: "support",
      confidence: 1.5,
      reason: "Out of range confidence.",
      createdAt: nowIso()
    });
    expect(result.success).toBe(false);
  });

  test("ConsensusProgressSchema accepts valid progress objects", () => {
    const result = ConsensusProgressSchema.safeParse({
      proposalId: "p1",
      status: "accepted",
      threshold: 2 / 3,
      eligibleWeight: 300,
      supportWeight: 200,
      rejectWeight: 100,
      abstainWeight: 0,
      missingWeight: 0,
      confidence: 0.8,
      rationale: "Support crossed the threshold.",
      finalizedAt: nowIso(),
      alignedAgentIds: [VALID_AGENT_ID],
      opposingAgentIds: []
    });
    expect(result.success).toBe(true);
  });

  test("ReputationEventSchema accepts valid reputation events", () => {
    const result = ReputationEventSchema.safeParse({
      eventId: "rep-abc",
      agentId: VALID_AGENT_ID,
      proposalId: "proposal-1",
      delta: 10,
      before: 100,
      after: 110,
      reason: "Vote aligned with finalized consensus",
      createdAt: nowIso()
    });
    expect(result.success).toBe(true);
  });

  test("SignedEnvelopeSchema accepts valid envelopes", () => {
    const result = SignedEnvelopeSchema.safeParse({
      kind: "proposal",
      signerId: VALID_AGENT_ID,
      publicKey: "-----BEGIN PUBLIC KEY-----",
      createdAt: nowIso(),
      digest: "a".repeat(64),
      payload: { subject: "test" },
      signature: "base64signature"
    });
    expect(result.success).toBe(true);
  });

  test("BlockSchema accepts valid blocks", () => {
    const now = nowIso();
    const result = BlockSchema.safeParse({
      blockId: "block-abc123",
      height: 1,
      previousHash: "GENESIS",
      hash: "b".repeat(64),
      createdAt: now,
      proposal: {
        proposalId: "proposal-1",
        proposerId: VALID_AGENT_ID,
        subject: "Block test",
        summary: "Testing block schema validation.",
        payload: { action: "test" },
        tags: ["consensus"],
        createdAt: now,
        expiresAt: now,
        status: "accepted"
      },
      votes: [
        {
          proposalId: "proposal-1",
          voterId: VALID_AGENT_ID,
          decision: "support",
          confidence: 0.85,
          reason: "Aligned with goals.",
          createdAt: now
        }
      ],
      result: {
        proposalId: "proposal-1",
        status: "accepted",
        threshold: 2 / 3,
        eligibleWeight: 300,
        supportWeight: 200,
        rejectWeight: 100,
        abstainWeight: 0,
        missingWeight: 0,
        confidence: 0.85,
        rationale: "Support crossed the BFT threshold.",
        finalizedAt: now,
        alignedAgentIds: [VALID_AGENT_ID],
        opposingAgentIds: []
      },
      auditEvents: []
    });
    expect(result.success).toBe(true);
  });

  test("BridgeAdapterManifestSchema accepts valid manifests", () => {
    const result = BridgeAdapterManifestSchema.safeParse({
      adapterId: "loopback-mailbox",
      version: "1.0.0",
      direction: "bidirectional",
      supportedOperations: ["sync-inbox", "send-message"],
      description: "Deterministic bridge for local consensus tests."
    });
    expect(result.success).toBe(true);
  });

  test("BridgeRequestSchema accepts valid bridge requests", () => {
    const result = BridgeRequestSchema.safeParse({
      requestId: "bridge-1",
      adapterId: "loopback-mailbox",
      operation: "send-message",
      payload: { address: "ops@furge.local", subject: "Test" },
      requestedBy: VALID_AGENT_ID,
      createdAt: nowIso()
    });
    expect(result.success).toBe(true);
  });

  test("BridgeValidationSchema accepts valid validations", () => {
    const validResult = BridgeValidationSchema.safeParse({
      valid: true,
      reasons: []
    });
    expect(validResult.success).toBe(true);

    const invalidResult = BridgeValidationSchema.safeParse({
      valid: false,
      reasons: ["Missing RFC-like address."]
    });
    expect(invalidResult.success).toBe(true);
  });

  test("BridgeExecutionReportSchema accepts valid reports", () => {
    const result = BridgeExecutionReportSchema.safeParse({
      runId: "bridge-run-1",
      adapterId: "loopback-mailbox",
      requestId: "bridge-1",
      status: "executed",
      validation: { valid: true, reasons: [] },
      response: { delivered: true },
      createdAt: nowIso(),
      consensusStatus: "accepted"
    });
    expect(result.success).toBe(true);
  });

  test("ProtocolFeeEventSchema accepts valid fee events", () => {
    const result = ProtocolFeeEventSchema.safeParse({
      feeEventId: "fee-1",
      tokenSymbol: "$FURGE",
      amount: 0.001512,
      kind: "bridge",
      payerId: VALID_AGENT_ID,
      referenceId: "bridge-run-1",
      createdAt: nowIso()
    });
    expect(result.success).toBe(true);
  });

  test("ProtocolFeeEventSchema rejects non-FURGE token symbols", () => {
    const result = ProtocolFeeEventSchema.safeParse({
      feeEventId: "fee-1",
      tokenSymbol: "$OTHER",
      amount: 0.001,
      kind: "bridge",
      payerId: VALID_AGENT_ID,
      referenceId: "ref-1",
      createdAt: nowIso()
    });
    expect(result.success).toBe(false);
  });

  test("AuditEventSchema accepts valid audit events", () => {
    const result = AuditEventSchema.safeParse({
      eventId: "audit-1",
      type: "agent.registered",
      actorId: VALID_AGENT_ID,
      referenceId: VALID_AGENT_ID,
      createdAt: nowIso(),
      payload: { label: "Claude Sentinel" }
    });
    expect(result.success).toBe(true);
  });
});
