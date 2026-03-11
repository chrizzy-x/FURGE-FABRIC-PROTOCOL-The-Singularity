import { nowIso, type AgentProfile, type ConsensusResult, type ProposalRecord, type VoteRecord } from "@furge/shared-types";
import type { ChainConfig } from "@furge/chain-builder";

export type ConsensusEvaluation = {
  result: ConsensusResult;
  weightedVotes: VoteRecord[];
};

export class ReputationWeightedConsensus {
  async evaluate(chain: ChainConfig, proposal: ProposalRecord, votes: VoteRecord[], agents: AgentProfile[]): Promise<ConsensusEvaluation> {
    const weightedVotes = votes.map((vote) => {
      const agent = agents.find((candidate) => candidate.agentId === vote.agentId);
      return {
        ...vote,
        weight: agent?.reputation ?? vote.weight
      };
    });

    const totalWeight = weightedVotes.reduce((sum, vote) => sum + vote.weight, 0);
    const supportVotes = weightedVotes.filter((vote) => vote.decision === "support");
    const rejectVotes = weightedVotes.filter((vote) => vote.decision === "reject");
    const supportWeight = supportVotes.reduce((sum, vote) => sum + vote.weight, 0);
    const rejectWeight = rejectVotes.reduce((sum, vote) => sum + vote.weight, 0);
    const confidenceBase = weightedVotes.reduce((sum, vote) => sum + vote.confidence * vote.weight, 0);
    const confidence = totalWeight === 0 ? 0 : Math.round((confidenceBase / totalWeight) * 100) / 100;
    const supportRatio = totalWeight === 0 ? 0 : supportWeight / totalWeight;

    let status: ConsensusResult["status"] = "timeout";
    let rationale = "Consensus timed out before enough reputation weight was collected.";

    if (supportRatio >= chain.input.finalityThreshold) {
      status = "accepted";
      rationale = `Support reached ${(supportRatio * 100).toFixed(1)}% against a ${(chain.input.finalityThreshold * 100).toFixed(0)}% threshold.`;
    } else if (rejectWeight > supportWeight && rejectWeight / totalWeight >= 1 - chain.input.finalityThreshold / 2) {
      status = "rejected";
      rationale = "Rejecting validators outweighed support before the finality threshold could be met.";
    }

    return {
      weightedVotes,
      result: {
        proposalId: proposal.id,
        chain: proposal.chain,
        status,
        confidence,
        supportWeight,
        rejectWeight,
        totalWeight,
        reachedAt: nowIso(),
        rationale,
        supportingAgents: supportVotes.map((vote) => vote.agentId),
        rejectingAgents: rejectVotes.map((vote) => vote.agentId)
      }
    };
  }

  applyEpochDecay(agents: AgentProfile[], decay: number): AgentProfile[] {
    return agents.map((agent) => ({
      ...agent,
      reputation: Math.round(agent.reputation * decay * 100) / 100
    }));
  }

  rewardAgents(agents: AgentProfile[], result: ConsensusResult): AgentProfile[] {
    return agents.map((agent) => {
      if (result.supportingAgents.includes(agent.agentId) && result.status === "accepted") {
        return { ...agent, reputation: Math.round((agent.reputation + 4) * 100) / 100 };
      }
      if (result.rejectingAgents.includes(agent.agentId) && result.status === "rejected") {
        return { ...agent, reputation: Math.round((agent.reputation + 2) * 100) / 100 };
      }
      if ((result.supportingAgents.includes(agent.agentId) || result.rejectingAgents.includes(agent.agentId)) && result.status === "timeout") {
        return { ...agent, reputation: Math.round((agent.reputation - 1) * 100) / 100 };
      }
      return agent;
    });
  }
}