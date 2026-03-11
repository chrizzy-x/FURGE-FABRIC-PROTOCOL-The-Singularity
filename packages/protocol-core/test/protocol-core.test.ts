import { describe, expect, test } from "vitest";
import { AgentIdentity, ProtocolCore, createProposal, createTamperedBlock, verifyBlockHash } from "@ffp/protocol-core";

function buildAgents() {
  return [
    AgentIdentity.generate({ label: "Alpha", modelFamily: "claude", capabilities: ["audit"] }),
    AgentIdentity.generate({ label: "Bravo", modelFamily: "gpt4", capabilities: ["consensus"] }),
    AgentIdentity.generate({ label: "Charlie", modelFamily: "gemini", capabilities: ["bridge"] })
  ];
}

describe("protocol-core identity and chain", () => {
  test("generates identities and verifies signed envelopes", () => {
    const identity = AgentIdentity.generate({ label: "Verifier", modelFamily: "deepseek", capabilities: ["audit", "consensus"] });
    const envelope = identity.signEnvelope("proposal", { ok: true, subject: "health-check" });

    expect(AgentIdentity.verifyEnvelope(envelope)).toBe(true);
    expect(AgentIdentity.verifyEnvelope({ ...envelope, digest: `${envelope.digest}00` })).toBe(false);
  });

  test("appends finalized blocks and detects tampering", () => {
    const agents = buildAgents();
    const core = new ProtocolCore(agents.map((agent) => agent.exportPublicRecord()));
    const proposal = createProposal({
      proposerId: agents[0].agentId,
      subject: "Protocol bootstrap",
      summary: "Establish the baseline block sequence.",
      payload: { scope: "layer-zero" },
      tags: ["consensus"]
    });

    core.submitProposal(proposal);
    core.recordVote({ proposalId: proposal.proposalId, voterId: agents[0].agentId, decision: "support", confidence: 0.81, reason: "Foundational protocol change.", createdAt: proposal.createdAt });
    core.recordVote({ proposalId: proposal.proposalId, voterId: agents[1].agentId, decision: "support", confidence: 0.79, reason: "Support meets quorum expectations.", createdAt: proposal.createdAt });
    core.recordVote({ proposalId: proposal.proposalId, voterId: agents[2].agentId, decision: "reject", confidence: 0.66, reason: "Conservative dissent for reputation tracking.", createdAt: proposal.createdAt });

    const finalizedAt = new Date(Date.now() + 50).toISOString();
    const broadcast = core.finalizeProposal({
      proposalId: proposal.proposalId,
      status: "accepted",
      threshold: 2 / 3,
      eligibleWeight: 300,
      supportWeight: 200,
      rejectWeight: 100,
      abstainWeight: 0,
      missingWeight: 0,
      confidence: 0.8,
      rationale: "Support reached the threshold.",
      finalizedAt,
      alignedAgentIds: [agents[0].agentId, agents[1].agentId],
      opposingAgentIds: [agents[2].agentId]
    });

    expect(core.immutableChain.verify().valid).toBe(true);
    expect(verifyBlockHash(broadcast.block)).toBe(true);
    expect(verifyBlockHash(createTamperedBlock(broadcast.block))).toBe(false);
    expect(core.reputationLedger.listEvents()).toHaveLength(3);
    expect(core.reputationLedger.getScore(agents[0].agentId)).toBeGreaterThan(100);
    expect(core.reputationLedger.getScore(agents[2].agentId)).toBeLessThan(100);
  });
});
