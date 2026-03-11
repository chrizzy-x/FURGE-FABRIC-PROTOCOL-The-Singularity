import {
  DEFAULT_THRESHOLD,
  type ConsensusProgress,
  type ConsensusResult,
  type Proposal,
  type Vote,
  makeDeterministicId,
  nowIso
} from "@ffp/shared-types";
import { ReputationLedger } from "@ffp/protocol-core";

export type ConsensusEngineOptions = {
  threshold?: number;
};

export class ConsensusEngine {
  readonly threshold: number;

  constructor(options: ConsensusEngineOptions = {}) {
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
  }

  evaluateProposal(proposal: Proposal, votes: Vote[], eligibleAgentIds: string[], ledger: ReputationLedger, now = new Date()): ConsensusProgress {
    const dedupedVotes = this.deduplicateVotes(votes);
    const eligibleWeight = eligibleAgentIds.reduce((total, agentId) => total + ledger.getScore(agentId), 0);
    const supportVotes = dedupedVotes.filter((vote) => vote.decision === "support");
    const rejectVotes = dedupedVotes.filter((vote) => vote.decision === "reject");
    const abstainVotes = dedupedVotes.filter((vote) => vote.decision === "abstain");

    const supportWeight = supportVotes.reduce((total, vote) => total + ledger.getScore(vote.voterId), 0);
    const rejectWeight = rejectVotes.reduce((total, vote) => total + ledger.getScore(vote.voterId), 0);
    const abstainWeight = abstainVotes.reduce((total, vote) => total + ledger.getScore(vote.voterId), 0);
    const missingWeight = Math.max(eligibleWeight - supportWeight - rejectWeight - abstainWeight, 0);

    if (supportWeight >= eligibleWeight * this.threshold) {
      return this.finalize("accepted", proposal, supportVotes, rejectVotes, ledger, {
        eligibleWeight,
        supportWeight,
        rejectWeight,
        abstainWeight,
        missingWeight,
        rationale: "Support crossed the two-thirds BFT threshold."
      });
    }

    if (supportWeight + missingWeight < eligibleWeight * this.threshold) {
      return this.finalize("rejected", proposal, rejectVotes, supportVotes, ledger, {
        eligibleWeight,
        supportWeight,
        rejectWeight,
        abstainWeight,
        missingWeight,
        rationale: "Rejecting weight prevented support from ever reaching the BFT threshold."
      });
    }

    if (now.getTime() >= new Date(proposal.expiresAt).getTime()) {
      return this.finalize("timed_out", proposal, supportVotes, rejectVotes, ledger, {
        eligibleWeight,
        supportWeight,
        rejectWeight,
        abstainWeight,
        missingWeight,
        rationale: "Proposal timed out before quorum reached a final state."
      });
    }

    return {
      proposalId: proposal.proposalId,
      status: "pending",
      threshold: this.threshold,
      eligibleWeight,
      supportWeight,
      rejectWeight,
      abstainWeight,
      missingWeight,
      confidence: this.calculateConfidence(dedupedVotes, ledger),
      rationale: "Proposal is still collecting weighted votes.",
      alignedAgentIds: supportVotes.map((vote) => vote.voterId),
      opposingAgentIds: rejectVotes.map((vote) => vote.voterId)
    };
  }

  private deduplicateVotes(votes: Vote[]): Vote[] {
    const seen = new Set<string>();
    const result: Vote[] = [];

    for (const vote of votes) {
      if (seen.has(vote.voterId)) {
        continue;
      }
      seen.add(vote.voterId);
      result.push(vote);
    }

    return result;
  }

  private finalize(
    status: ConsensusResult["status"],
    proposal: Proposal,
    alignedVotes: Vote[],
    opposingVotes: Vote[],
    ledger: ReputationLedger,
    metrics: {
      eligibleWeight: number;
      supportWeight: number;
      rejectWeight: number;
      abstainWeight: number;
      missingWeight: number;
      rationale: string;
    }
  ): ConsensusResult {
    const confidence = this.calculateConfidence([...alignedVotes, ...opposingVotes], ledger, status === "rejected" ? "reject" : "support");
    return {
      proposalId: proposal.proposalId,
      status,
      threshold: this.threshold,
      eligibleWeight: metrics.eligibleWeight,
      supportWeight: metrics.supportWeight,
      rejectWeight: metrics.rejectWeight,
      abstainWeight: metrics.abstainWeight,
      missingWeight: metrics.missingWeight,
      confidence,
      rationale: metrics.rationale,
      finalizedAt: nowIso(),
      alignedAgentIds: alignedVotes.map((vote) => vote.voterId),
      opposingAgentIds: opposingVotes.map((vote) => vote.voterId)
    };
  }

  private calculateConfidence(votes: Vote[], ledger?: ReputationLedger, focus: "support" | "reject" = "support"): number {
    const filteredVotes = focus === "support" ? votes.filter((vote) => vote.decision !== "reject") : votes.filter((vote) => vote.decision !== "support");
    const relevantVotes = filteredVotes.length > 0 ? filteredVotes : votes;
    const weighted = relevantVotes.reduce(
      (total, vote) => {
        const weight = ledger ? ledger.getScore(vote.voterId) : 1;
        total.weight += weight;
        total.score += vote.confidence * weight;
        return total;
      },
      { score: 0, weight: 0 }
    );

    if (weighted.weight === 0) {
      return 0;
    }

    return Math.round((weighted.score / weighted.weight) * 1000) / 1000;
  }
}

export function createTimeoutProposal(proposal: Proposal): Proposal {
  return {
    ...proposal,
    expiresAt: new Date(Date.now() - 1).toISOString()
  };
}

export function makeConsensusRunId(proposalId: string): string {
  return makeDeterministicId("consensus", proposalId);
}
