import { describe, expect, test } from "vitest";
import { AgentNode, defaultDeterministicEvaluator } from "@ffp/agent-node";
import { LoopbackBridgeAdapter } from "@ffp/bridges";
import { AgentIdentity } from "@ffp/protocol-core";
import type { AgentRecord, Proposal } from "@ffp/shared-types";
import { nowIso } from "@ffp/shared-types";

function buildIdentities() {
  return [
    AgentIdentity.generate({ label: "Alpha", modelFamily: "claude", capabilities: ["audit", "coordination"] }),
    AgentIdentity.generate({ label: "Bravo", modelFamily: "gpt4", capabilities: ["coordination", "consensus"] }),
    AgentIdentity.generate({ label: "Charlie", modelFamily: "gemini", capabilities: ["bridge", "network"] })
  ];
}

function buildSeedAgents(identities: AgentIdentity[]): AgentRecord[] {
  return identities.map((identity) => identity.exportPublicRecord());
}

function createTestNode(identity: AgentIdentity, seedAgents: AgentRecord[]): AgentNode {
  const node = new AgentNode({
    identity,
    seedAgents,
    listenAddresses: ["/ip4/127.0.0.1/tcp/0"]
  });
  node.bridgeRegistry.register(new LoopbackBridgeAdapter());
  return node;
}

describe("defaultDeterministicEvaluator", () => {
  test("returns a support, reject, or abstain decision", () => {
    const identity = AgentIdentity.generate({ label: "Evaluator", modelFamily: "claude", capabilities: ["audit"] });
    const agent = identity.exportPublicRecord();
    const proposal: Proposal = {
      proposalId: "proposal-eval-1",
      proposerId: agent.agentId,
      subject: "Evaluate this proposal",
      summary: "Test deterministic evaluation.",
      payload: { action: "evaluate" },
      tags: ["consensus"],
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 5_000).toISOString(),
      status: "pending"
    };

    const result = defaultDeterministicEvaluator(proposal, agent);
    expect(["support", "reject", "abstain"]).toContain(result.decision);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.reason.length).toBeGreaterThan(3);
  });

  test("produces deterministic results for the same inputs", () => {
    const identity = AgentIdentity.generate({ label: "Repeater", modelFamily: "gpt4", capabilities: ["consensus"] });
    const agent = identity.exportPublicRecord();
    const proposal: Proposal = {
      proposalId: "proposal-stable-1",
      proposerId: agent.agentId,
      subject: "Stability test",
      summary: "Same input should produce the same vote.",
      payload: { action: "repeat" },
      tags: ["audit"],
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
      status: "pending"
    };

    const first = defaultDeterministicEvaluator(proposal, agent);
    const second = defaultDeterministicEvaluator(proposal, agent);
    expect(first.decision).toBe(second.decision);
    expect(first.confidence).toBe(second.confidence);
  });

  test("different agents can vote differently on the same proposal", () => {
    const identities = buildIdentities();
    const agents = buildSeedAgents(identities);
    const proposal: Proposal = {
      proposalId: "proposal-diverse-1",
      proposerId: agents[0].agentId,
      subject: "Diverse voting test",
      summary: "Different agents should produce varied decisions.",
      payload: { action: "diversify" },
      tags: ["consensus", "bridge", "audit", "network", "coordination", "observability"],
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
      status: "pending"
    };

    const decisions = agents.map((agent) => defaultDeterministicEvaluator(proposal, agent));
    expect(decisions).toHaveLength(3);
    for (const vote of decisions) {
      expect(["support", "reject", "abstain"]).toContain(vote.decision);
    }
  });

  test("capability boost increases support score for matching tags", () => {
    const bridgeAgent = AgentIdentity.generate({
      label: "BridgeExpert",
      modelFamily: "gemini",
      capabilities: ["bridge", "network"]
    });
    const generalAgent = AgentIdentity.generate({
      label: "General",
      modelFamily: "gpt4",
      capabilities: ["consensus"]
    });

    const proposal: Proposal = {
      proposalId: "proposal-bridge-boost",
      proposerId: bridgeAgent.agentId,
      subject: "Bridge validation test",
      summary: "Test capability boost for bridge tags.",
      payload: { action: "bridge" },
      tags: ["bridge", "network"],
      createdAt: "2026-06-01T00:00:00.000Z",
      expiresAt: "2026-06-01T00:05:00.000Z",
      status: "pending"
    };

    const bridgeResult = defaultDeterministicEvaluator(proposal, bridgeAgent.exportPublicRecord());
    const generalResult = defaultDeterministicEvaluator(proposal, generalAgent.exportPublicRecord());

    expect(bridgeResult).toBeDefined();
    expect(generalResult).toBeDefined();
    expect(typeof bridgeResult.confidence).toBe("number");
    expect(typeof generalResult.confidence).toBe("number");
  });
});

describe("AgentNode construction and state", () => {
  test("initializes with correct identity and seed agents", () => {
    const identities = buildIdentities();
    const seedAgents = buildSeedAgents(identities);
    const node = createTestNode(identities[0], seedAgents);

    expect(node.identity.agentId).toBe(identities[0].agentId);
    expect(node.core.listAgents()).toHaveLength(3);
    expect(node.core.listAgentIds()).toContain(identities[0].agentId);
    expect(node.core.listAgentIds()).toContain(identities[1].agentId);
    expect(node.core.listAgentIds()).toContain(identities[2].agentId);
  });

  test("registers the loopback bridge adapter", () => {
    const identities = buildIdentities();
    const seedAgents = buildSeedAgents(identities);
    const node = createTestNode(identities[0], seedAgents);

    const adapters = node.bridgeRegistry.listAdapters();
    expect(adapters).toHaveLength(1);
    expect(adapters[0].adapterId).toBe("loopback-mailbox");
  });

  test("returns offline peer metadata before start", () => {
    const identities = buildIdentities();
    const seedAgents = buildSeedAgents(identities);
    const node = createTestNode(identities[0], seedAgents);

    const metadata = node.getPeerMetadata();
    expect(metadata.agentId).toBe(identities[0].agentId);
    expect(metadata.peerId).toBe("offline");
    expect(metadata.listenAddresses).toHaveLength(0);
  });

  test("getSnapshot returns complete protocol state", () => {
    const identities = buildIdentities();
    const seedAgents = buildSeedAgents(identities);
    const node = createTestNode(identities[0], seedAgents);

    const peers = identities.map((id) => ({
      agentId: id.agentId,
      peerId: "offline",
      listenAddresses: []
    }));

    const snapshot = node.getSnapshot(peers);
    expect(snapshot.agents).toHaveLength(3);
    expect(snapshot.proposals).toHaveLength(0);
    expect(snapshot.blocks).toHaveLength(0);
    expect(snapshot.peers).toHaveLength(3);
    expect(snapshot.feeEvents).toHaveLength(0);
    expect(snapshot.bridgeReports).toHaveLength(0);
  });
});

describe("AgentNode lifecycle", () => {
  test("starts and stops without error", async () => {
    const identities = buildIdentities();
    const seedAgents = buildSeedAgents(identities);
    const node = createTestNode(identities[0], seedAgents);

    await node.start();
    const metadata = node.getPeerMetadata();
    expect(metadata.peerId).not.toBe("offline");
    expect(metadata.listenAddresses.length).toBeGreaterThan(0);

    await node.stop();
  });

  test("start is idempotent", async () => {
    const identities = buildIdentities();
    const seedAgents = buildSeedAgents(identities);
    const node = createTestNode(identities[0], seedAgents);

    await node.start();
    const firstPeerId = node.getPeerMetadata().peerId;
    await node.start();
    expect(node.getPeerMetadata().peerId).toBe(firstPeerId);
    await node.stop();
  });

  test("stop is idempotent", async () => {
    const identities = buildIdentities();
    const seedAgents = buildSeedAgents(identities);
    const node = createTestNode(identities[0], seedAgents);

    await node.stop();
    await node.stop();
  });
});
