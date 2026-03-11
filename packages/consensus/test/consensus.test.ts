import { describe, expect, test } from "vitest";
import { ConsensusEngine, createTimeoutProposal } from "@ffp/consensus";
import { AgentIdentity, ProtocolCore, createProposal } from "@ffp/protocol-core";

function createSeedCore() {
  const identities = [
    AgentIdentity.generate({ label: "Alpha", modelFamily: "claude", capabilities: ["audit"] }),
    AgentIdentity.generate({ label: "Beta", modelFamily: "gpt4", capabilities: ["consensus"] }),
    AgentIdentity.generate({ label: "Gamma", modelFamily: "gemini", capabilities: ["bridge"] })
  ];
  const core = new ProtocolCore(identities.map((identity) => identity.exportPublicRecord()));
  const proposal = createProposal({
    proposerId: identities[0].agentId,
    subject: "Threshold probe",
    summary: "Measure weighted BFT decisions.",
    payload: { topic: "threshold" },
    tags: ["consensus"]
  });
  return { identities, core, proposal };
}

describe("consensus engine", () => {
  test("accepts exactly at two-thirds weighted support", () => {
    const { identities, core, proposal } = createSeedCore();
    const engine = new ConsensusEngine();
    const votes = [
      { proposalId: proposal.proposalId, voterId: identities[0].agentId, decision: "support", confidence: 0.8, reason: "Aligned", createdAt: proposal.createdAt },
      { proposalId: proposal.proposalId, voterId: identities[1].agentId, decision: "support", confidence: 0.78, reason: "Aligned", createdAt: proposal.createdAt }
    ];

    const result = engine.evaluateProposal(proposal, votes, identities.map((identity) => identity.agentId), core.reputationLedger);
    expect(result.status).toBe("accepted");
    expect(result.supportWeight).toBe(200);
  });

  test("rejects when remaining support cannot reach quorum", () => {
    const { identities, core, proposal } = createSeedCore();
    const engine = new ConsensusEngine();
    const votes = [
      { proposalId: proposal.proposalId, voterId: identities[0].agentId, decision: "support", confidence: 0.7, reason: "Support", createdAt: proposal.createdAt },
      { proposalId: proposal.proposalId, voterId: identities[1].agentId, decision: "reject", confidence: 0.82, reason: "Reject", createdAt: proposal.createdAt },
      { proposalId: proposal.proposalId, voterId: identities[2].agentId, decision: "abstain", confidence: 0.5, reason: "Abstain", createdAt: proposal.createdAt }
    ];

    const result = engine.evaluateProposal(proposal, votes, identities.map((identity) => identity.agentId), core.reputationLedger);
    expect(result.status).toBe("rejected");
  });

  test("times out when quorum never resolves before expiry", () => {
    const { identities, core, proposal } = createSeedCore();
    const engine = new ConsensusEngine();
    const timedOut = createTimeoutProposal(proposal);
    const votes = [
      { proposalId: proposal.proposalId, voterId: identities[0].agentId, decision: "support", confidence: 0.7, reason: "Support", createdAt: proposal.createdAt }
    ];

    const result = engine.evaluateProposal(timedOut, votes, identities.map((identity) => identity.agentId), core.reputationLedger);
    expect(result.status).toBe("timed_out");
  });
});
