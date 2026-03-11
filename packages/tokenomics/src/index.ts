import { createMoney, makeId, nowIso, roundAmount, type BalanceSnapshot, type ChainId, type CostEstimate, type FeeJournalEntry, type MoneyAmount } from "@furge/shared-types";
import type { ChainConfig } from "@furge/chain-builder";

export class TokenLedger {
  private readonly balances = new Map<string, number>();
  private readonly journals: FeeJournalEntry[] = [];

  constructor(initialBalances: BalanceSnapshot[] = []) {
    initialBalances.forEach((balance) => {
      this.balances.set(this.key(balance.ownerId, balance.token), balance.amount);
    });
  }

  private key(ownerId: string, token: string): string {
    return `${ownerId}:${token}`;
  }

  credit(ownerId: string, token: string, amount: number): void {
    const key = this.key(ownerId, token);
    this.balances.set(key, roundAmount((this.balances.get(key) ?? 0) + amount));
  }

  debit(ownerId: string, token: string, amount: number): void {
    this.credit(ownerId, token, -amount);
  }

  transfer(params: { chain: ChainId; payerId: string; payeeId: string; token: string; amount: number; kind: FeeJournalEntry["kind"]; proposalId?: string }): FeeJournalEntry {
    this.debit(params.payerId, params.token, params.amount);
    this.credit(params.payeeId, params.token, params.amount);
    const entry: FeeJournalEntry = {
      id: makeId("journal", `${params.chain}:${params.kind}:${params.payerId}:${params.payeeId}:${params.amount}:${this.journals.length}`),
      chain: params.chain,
      proposalId: params.proposalId,
      payerId: params.payerId,
      payeeId: params.payeeId,
      token: params.token,
      amount: roundAmount(params.amount),
      kind: params.kind,
      timestamp: nowIso()
    };
    this.journals.push(entry);
    return entry;
  }

  burnProtocolFee(chain: ChainId, payerId: string, amount: number, proposalId?: string): FeeJournalEntry {
    return this.transfer({
      chain,
      payerId,
      payeeId: "furge-burn",
      token: "FURGE",
      amount,
      kind: "protocol-burn",
      proposalId
    });
  }

  estimateQueryCost(chain: ChainConfig, complexity: "low" | "medium" | "high", minAgents: number): CostEstimate {
    const base = complexity === "high" ? 14 : complexity === "medium" ? 9 : 5;
    const agentComponent = minAgents * 1.25;
    const riskComponent = chain.chainName === "MedicalChain" || chain.chainName === "LegalChain" ? 4 : 2;
    const amount = roundAmount(base + agentComponent + riskComponent);
    return {
      chain: chain.chainName,
      token: chain.input.nativeToken,
      amount,
      breakdown: [
        { label: "base", amount: base },
        { label: "agent-weight", amount: roundAmount(agentComponent) },
        { label: "domain-risk", amount: riskComponent }
      ]
    };
  }

  getBalances(ownerId: string): BalanceSnapshot[] {
    return Array.from(this.balances.entries())
      .filter(([key]) => key.startsWith(`${ownerId}:`))
      .map(([key, amount]) => {
        const token = key.split(":")[1] ?? "UNKNOWN";
        return {
          ownerId,
          token,
          amount
        };
      });
  }

  getBalance(ownerId: string, token: string): MoneyAmount {
    return createMoney(token, this.balances.get(this.key(ownerId, token)) ?? 0);
  }

  getJournals(): FeeJournalEntry[] {
    return [...this.journals];
  }
}