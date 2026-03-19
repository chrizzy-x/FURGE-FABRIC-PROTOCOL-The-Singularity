import {
  PROTOCOL_TOKEN_SYMBOL,
  ProtocolFeeEventSchema,
  ProtocolTokenAccountSchema,
  ProtocolTokenEventSchema,
  ProtocolTokenPolicySchema,
  ProtocolTokenSupplySchema,
  ProtocolTokenTransferReceiptSchema,
  makeDeterministicId,
  nowIso,
  roundTokenAmount,
  type ProtocolFeeEvent,
  type ProtocolTokenAccount,
  type ProtocolTokenEvent,
  type ProtocolTokenPolicy,
  type ProtocolTokenSupply,
  type ProtocolTokenTransferReceipt
} from "@ffp/shared-types";

export const PROTOCOL_TREASURY_OWNER_ID = "protocol-treasury";
export const PROTOCOL_TREASURY_ACCOUNT_ID = `system:${PROTOCOL_TREASURY_OWNER_ID}`;

export const DEFAULT_FURGE_POLICY = ProtocolTokenPolicySchema.parse({
  tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
  maxSupply: 10_000_000_000,
  genesisTreasuryAllocation: 1_000_000,
  genesisAgentGrant: 10_000,
  initialReward: 50,
  halvingInterval: 32,
  baseTransferFee: 0.05,
  transferFeeRate: 0.002,
  epochFeeStep: 0.01
});

export type ProtocolTokenLedgerState = {
  accounts: ProtocolTokenAccount[];
  tokenAccounts?: ProtocolTokenAccount[];
  tokenEvents: ProtocolTokenEvent[];
  feeEvents: ProtocolFeeEvent[];
  supply: ProtocolTokenSupply;
  tokenSupply?: ProtocolTokenSupply;
};

export class FurgeFeeLedger {
  private readonly policy: ProtocolTokenPolicy;
  private readonly accounts = new Map<string, ProtocolTokenAccount>();
  private readonly tokenEvents: ProtocolTokenEvent[] = [];
  private readonly feeEvents: ProtocolFeeEvent[] = [];
  private mintedSupply = 0;

  constructor(policy: Partial<ProtocolTokenPolicy> = {}) {
    this.policy = ProtocolTokenPolicySchema.parse({
      ...DEFAULT_FURGE_POLICY,
      ...policy,
      tokenSymbol: PROTOCOL_TOKEN_SYMBOL
    });
  }

  getPolicy(): ProtocolTokenPolicy {
    return this.policy;
  }

  seedGenesis(agentIds: string[], createdAt = nowIso()): ProtocolTokenLedgerState {
    if (this.tokenEvents.length > 0) {
      return this.exportState();
    }

    this.creditAccount({
      ownerId: PROTOCOL_TREASURY_OWNER_ID,
      ownerType: "system",
      amount: this.policy.genesisTreasuryAllocation,
      kind: "genesis",
      referenceId: "genesis:treasury",
      initiatorId: PROTOCOL_TREASURY_ACCOUNT_ID,
      createdAt,
      metadata: { category: "treasury" }
    });

    for (const agentId of agentIds) {
      this.creditAccount({
        ownerId: agentId,
        ownerType: "agent",
        amount: this.policy.genesisAgentGrant,
        kind: "genesis",
        referenceId: `genesis:${agentId}`,
        initiatorId: agentId,
        createdAt,
        metadata: { category: "validator-bootstrap" }
      });
    }

    return this.exportState();
  }

  estimateTransferFee(input: { amount: number; blockHeight?: number; memoBytes?: number }): number {
    const blockHeight = input.blockHeight ?? this.nextRewardBlockHeight();
    const epochIndex = Math.floor((Math.max(blockHeight, 1) - 1) / this.policy.halvingInterval);
    const fee =
      this.policy.baseTransferFee +
      input.amount * this.policy.transferFeeRate +
      epochIndex * this.policy.epochFeeStep +
      (input.memoBytes ?? 0) * 0.0001;
    return roundTokenAmount(fee);
  }

  recordValidationReward(input: { validatorId: string; blockHeight: number; referenceId: string; createdAt?: string }): ProtocolTokenEvent | null {
    const existing = this.tokenEvents.find((event) => event.kind === "reward" && event.referenceId === input.referenceId);
    if (existing) {
      return existing;
    }

    const reward = Math.min(this.calculateRewardForBlock(input.blockHeight), this.getRemainingSupply());
    if (reward <= 0) {
      return null;
    }

    return this.creditAccount({
      ownerId: input.validatorId,
      ownerType: "agent",
      amount: reward,
      kind: "reward",
      referenceId: input.referenceId,
      initiatorId: input.validatorId,
      blockHeight: input.blockHeight,
      createdAt: input.createdAt ?? nowIso(),
      metadata: { rewardModel: "halving", blockHeight: input.blockHeight }
    });
  }

  recordTransfer(input: {
    fromAgentId: string;
    toAgentId: string;
    amount: number;
    nonce: number;
    referenceId: string;
    proposalId?: string;
    validatorId: string;
    blockHeight: number;
    createdAt?: string;
    memo?: string;
  }): ProtocolTokenTransferReceipt {
    const createdAt = input.createdAt ?? nowIso();
    const sender = this.ensureAccount(input.fromAgentId, "agent", createdAt);
    const recipient = this.ensureAccount(input.toAgentId, "agent", createdAt);
    const validator = this.ensureAccount(this.resolveFeeCollector(input.fromAgentId, input.validatorId), this.resolveFeeCollectorType(input.fromAgentId, input.validatorId), createdAt);
    const amount = roundTokenAmount(input.amount);
    const fee = this.estimateTransferFee({ amount, blockHeight: input.blockHeight, memoBytes: input.memo?.length ?? 0 });
    const total = roundTokenAmount(amount + fee);

    if (amount <= 0) {
      throw new Error("Transfer amount must be positive");
    }

    if (input.fromAgentId === input.toAgentId) {
      throw new Error("Sender and recipient must differ for protocol token transfers");
    }

    if (input.nonce !== sender.nonce) {
      throw new Error(`Transfer nonce mismatch for ${input.fromAgentId}: expected ${sender.nonce}, received ${input.nonce}`);
    }

    if (sender.balance < total) {
      throw new Error(`Transfer would overspend ${input.fromAgentId}`);
    }

    const updatedSender = this.writeAccount({
      ...sender,
      balance: roundTokenAmount(sender.balance - total),
      nonce: sender.nonce + 1,
      updatedAt: createdAt
    });
    const updatedRecipient = this.writeAccount({
      ...recipient,
      balance: roundTokenAmount(recipient.balance + amount),
      updatedAt: createdAt
    });
    const validatorBase = updatedRecipient.accountId === validator.accountId ? updatedRecipient : validator;
    const updatedValidator = this.writeAccount({
      ...validatorBase,
      balance: roundTokenAmount(validatorBase.balance + fee),
      updatedAt: createdAt
    });

    const transferEvent = ProtocolTokenEventSchema.parse({
      eventId: makeDeterministicId("token", `${input.referenceId}:transfer`),
      kind: "transfer",
      tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
      referenceId: input.referenceId,
      blockHeight: input.blockHeight,
      fromAccountId: updatedSender.accountId,
      toAccountId: updatedRecipient.accountId,
      initiatorId: input.fromAgentId,
      amount,
      feeAmount: fee,
      nonce: input.nonce,
      supplyAfter: this.mintedSupply,
      createdAt,
      metadata: {
        validatorAccountId: updatedValidator.accountId,
        memo: input.memo ?? null
      }
    });

    const feeRecord = ProtocolFeeEventSchema.parse({
      feeEventId: makeDeterministicId("fee", `${input.referenceId}:coordination`),
      tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
      amount: fee,
      kind: "coordination",
      payerId: input.fromAgentId,
      payeeId: updatedValidator.ownerId,
      referenceId: input.referenceId,
      createdAt
    });

    const feeEvent = ProtocolTokenEventSchema.parse({
      eventId: makeDeterministicId("token", `${feeRecord.feeEventId}:settlement`),
      kind: "fee_settlement",
      tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
      referenceId: input.referenceId,
      blockHeight: input.blockHeight,
      fromAccountId: updatedSender.accountId,
      toAccountId: updatedValidator.accountId,
      initiatorId: input.fromAgentId,
      amount: fee,
      feeAmount: 0,
      nonce: input.nonce,
      supplyAfter: this.mintedSupply,
      createdAt,
      metadata: {
        feeKind: feeRecord.kind,
        feeEventId: feeRecord.feeEventId
      }
    });

    this.tokenEvents.push(transferEvent, feeEvent);
    this.feeEvents.push(feeRecord);

    return ProtocolTokenTransferReceiptSchema.parse({
      proposalId: input.proposalId ?? input.referenceId,
      blockId: input.referenceId,
      transferEvent,
      feeEvent,
      feeRecord,
      senderAccount: updatedSender,
      recipientAccount: updatedRecipient,
      validatorAccount: updatedValidator,
      supply: this.getSupplySnapshot()
    });
  }

  recordBridgeFee(input: { payerId: string; referenceId: string; amount: number; payeeId?: string; blockHeight?: number; createdAt?: string }): ProtocolFeeEvent {
    return this.recordFeeSettlement({
      payerId: input.payerId,
      referenceId: input.referenceId,
      amount: input.amount,
      kind: "bridge",
      payeeId: input.payeeId,
      blockHeight: input.blockHeight,
      createdAt: input.createdAt
    });
  }

  recordCoordinationFee(input: { payerId: string; referenceId: string; amount: number; payeeId?: string; blockHeight?: number; createdAt?: string }): ProtocolFeeEvent {
    return this.recordFeeSettlement({
      payerId: input.payerId,
      referenceId: input.referenceId,
      amount: input.amount,
      kind: "coordination",
      payeeId: input.payeeId,
      blockHeight: input.blockHeight,
      createdAt: input.createdAt
    });
  }

  importEvent(event: ProtocolFeeEvent): void {
    if (this.feeEvents.some((entry) => entry.feeEventId === event.feeEventId)) {
      return;
    }

    this.applyImportedFeeEvent(ProtocolFeeEventSchema.parse(event));
  }

  importState(state: ProtocolTokenLedgerState): void {
    this.accounts.clear();
    this.tokenEvents.length = 0;
    this.feeEvents.length = 0;

    for (const account of state.tokenAccounts ?? state.accounts) {
      const parsed = ProtocolTokenAccountSchema.parse(account);
      this.accounts.set(parsed.accountId, parsed);
    }

    for (const event of state.tokenEvents) {
      this.tokenEvents.push(ProtocolTokenEventSchema.parse(event));
    }

    for (const event of state.feeEvents) {
      this.feeEvents.push(ProtocolFeeEventSchema.parse(event));
    }

    this.mintedSupply = ProtocolTokenSupplySchema.parse(state.tokenSupply ?? state.supply).mintedSupply;
  }

  exportState(): ProtocolTokenLedgerState {
    const accounts = this.listAccounts();
    const supply = this.getSupplySnapshot();

    return {
      accounts,
      tokenAccounts: accounts,
      tokenEvents: this.listTokenEvents(),
      feeEvents: this.listEvents(),
      supply,
      tokenSupply: supply
    };
  }

  listEvents(): ProtocolFeeEvent[] {
    return [...this.feeEvents];
  }

  listTokenEvents(): ProtocolTokenEvent[] {
    return [...this.tokenEvents];
  }

  listAccounts(): ProtocolTokenAccount[] {
    return Array.from(this.accounts.values()).sort((left, right) => left.accountId.localeCompare(right.accountId));
  }

  getAccountByOwnerId(ownerId: string): ProtocolTokenAccount {
    const account = this.accounts.get(ownerId.startsWith("agent:") || ownerId.startsWith("system:") ? ownerId : `agent:${ownerId}`) ?? this.accounts.get(`system:${ownerId}`);
    if (!account) {
      throw new Error(`Unknown token account owner ${ownerId}`);
    }
    return account;
  }

  getAgentAccount(agentId: string): ProtocolTokenAccount {
    return this.ensureAccount(agentId, "agent");
  }

  getSupplySnapshot(): ProtocolTokenSupply {
    return ProtocolTokenSupplySchema.parse({
      tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
      maxSupply: this.policy.maxSupply,
      mintedSupply: roundTokenAmount(this.mintedSupply),
      circulatingSupply: roundTokenAmount(Array.from(this.accounts.values()).reduce((total, account) => total + account.balance, 0)),
      remainingSupply: roundTokenAmount(this.getRemainingSupply()),
      currentReward: roundTokenAmount(this.calculateRewardForBlock(this.nextRewardBlockHeight())),
      halvingInterval: this.policy.halvingInterval,
      nextHalvingAtBlock: this.nextHalvingAtBlock()
    });
  }

  getBalanceSheet(): Record<string, number> {
    const balanceSheet: Record<string, number> = {};
    for (const event of this.feeEvents) {
      balanceSheet[event.payerId] = roundTokenAmount((balanceSheet[event.payerId] ?? 0) - event.amount);
      if (event.payeeId) {
        balanceSheet[event.payeeId] = roundTokenAmount((balanceSheet[event.payeeId] ?? 0) + event.amount);
      }
    }
    return balanceSheet;
  }

  private recordFeeSettlement(input: {
    payerId: string;
    referenceId: string;
    amount: number;
    kind: ProtocolFeeEvent["kind"];
    payeeId?: string;
    blockHeight?: number;
    createdAt?: string;
  }): ProtocolFeeEvent {
    const createdAt = input.createdAt ?? nowIso();
    const amount = roundTokenAmount(input.amount);
    const payer = this.ensureAccount(input.payerId, "agent", createdAt);
    const resolvedPayeeId = this.resolveFeeCollector(input.payerId, input.payeeId);
    const payeeType = this.resolveFeeCollectorType(input.payerId, input.payeeId);
    const payee = this.ensureAccount(resolvedPayeeId, payeeType, createdAt);

    if (payer.balance < amount) {
      throw new Error(`Fee settlement would overspend ${input.payerId}`);
    }

    const updatedPayer = this.writeAccount({
      ...payer,
      balance: roundTokenAmount(payer.balance - amount),
      nonce: payer.nonce + 1,
      updatedAt: createdAt
    });
    const updatedPayee = this.writeAccount({
      ...payee,
      balance: roundTokenAmount(payee.balance + amount),
      updatedAt: createdAt
    });

    const feeEvent = ProtocolFeeEventSchema.parse({
      feeEventId: makeDeterministicId("fee", `${input.referenceId}:${input.kind}`),
      tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
      amount,
      kind: input.kind,
      payerId: input.payerId,
      payeeId: updatedPayee.ownerId,
      referenceId: input.referenceId,
      createdAt
    });

    const tokenEvent = ProtocolTokenEventSchema.parse({
      eventId: makeDeterministicId("token", `${feeEvent.feeEventId}:settlement`),
      kind: "fee_settlement",
      tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
      referenceId: input.referenceId,
      blockHeight: input.blockHeight,
      fromAccountId: updatedPayer.accountId,
      toAccountId: updatedPayee.accountId,
      initiatorId: input.payerId,
      amount,
      feeAmount: 0,
      nonce: payer.nonce,
      supplyAfter: this.mintedSupply,
      createdAt,
      metadata: {
        feeKind: feeEvent.kind,
        feeEventId: feeEvent.feeEventId
      }
    });

    this.feeEvents.push(feeEvent);
    this.tokenEvents.push(tokenEvent);
    return feeEvent;
  }

  private applyImportedFeeEvent(event: ProtocolFeeEvent): void {
    const payer = this.ensureAccount(event.payerId, "agent", event.createdAt);
    const payeeOwnerId = event.payeeId ?? PROTOCOL_TREASURY_OWNER_ID;
    const payeeType = payeeOwnerId === PROTOCOL_TREASURY_OWNER_ID ? "system" : "agent";
    const payee = this.ensureAccount(payeeOwnerId, payeeType, event.createdAt);

    this.writeAccount({
      ...payer,
      balance: roundTokenAmount(payer.balance - event.amount),
      nonce: payer.nonce + 1,
      updatedAt: event.createdAt
    });
    this.writeAccount({
      ...payee,
      balance: roundTokenAmount(payee.balance + event.amount),
      updatedAt: event.createdAt
    });

    this.feeEvents.push(event);
    this.tokenEvents.push(
      ProtocolTokenEventSchema.parse({
        eventId: makeDeterministicId("token", `${event.feeEventId}:settlement`),
        kind: "fee_settlement",
        tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
        referenceId: event.referenceId,
        fromAccountId: payer.accountId,
        toAccountId: payee.accountId,
        initiatorId: event.payerId,
        amount: event.amount,
        feeAmount: 0,
        nonce: payer.nonce,
        supplyAfter: this.mintedSupply,
        createdAt: event.createdAt,
        metadata: {
          feeKind: event.kind,
          feeEventId: event.feeEventId
        }
      })
    );
  }

  private creditAccount(input: {
    ownerId: string;
    ownerType: ProtocolTokenAccount["ownerType"];
    amount: number;
    kind: ProtocolTokenEvent["kind"];
    referenceId: string;
    initiatorId: string;
    createdAt: string;
    blockHeight?: number;
    metadata?: Record<string, unknown>;
  }): ProtocolTokenEvent {
    const account = this.ensureAccount(input.ownerId, input.ownerType, input.createdAt);
    const amount = roundTokenAmount(input.amount);
    const nextMintedSupply = roundTokenAmount(this.mintedSupply + amount);
    if (nextMintedSupply > this.policy.maxSupply) {
      throw new Error(`Minting ${amount} ${PROTOCOL_TOKEN_SYMBOL} would exceed the protocol max supply`);
    }

    this.mintedSupply = nextMintedSupply;
    const updatedAccount = this.writeAccount({
      ...account,
      balance: roundTokenAmount(account.balance + amount),
      updatedAt: input.createdAt
    });

    const event = ProtocolTokenEventSchema.parse({
      eventId: makeDeterministicId("token", `${input.referenceId}:${input.kind}`),
      kind: input.kind,
      tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
      referenceId: input.referenceId,
      blockHeight: input.blockHeight,
      toAccountId: updatedAccount.accountId,
      initiatorId: input.initiatorId,
      amount,
      feeAmount: 0,
      supplyAfter: this.mintedSupply,
      createdAt: input.createdAt,
      metadata: input.metadata ?? {}
    });

    this.tokenEvents.push(event);
    return event;
  }

  private ensureAccount(ownerId: string, ownerType: ProtocolTokenAccount["ownerType"], createdAt = nowIso()): ProtocolTokenAccount {
    const accountId = `${ownerType}:${ownerId}`;
    const existing = this.accounts.get(accountId);
    if (existing) {
      return existing;
    }

    const account = ProtocolTokenAccountSchema.parse({
      accountId,
      ownerId,
      ownerType,
      balance: 0,
      nonce: 0,
      createdAt,
      updatedAt: createdAt
    });
    this.accounts.set(account.accountId, account);
    return account;
  }

  private writeAccount(account: ProtocolTokenAccount): ProtocolTokenAccount {
    const parsed = ProtocolTokenAccountSchema.parse(account);
    this.accounts.set(parsed.accountId, parsed);
    return parsed;
  }

  private calculateRewardForBlock(blockHeight: number): number {
    if (blockHeight <= 0) {
      return 0;
    }

    const epochIndex = Math.floor((blockHeight - 1) / this.policy.halvingInterval);
    return roundTokenAmount(this.policy.initialReward / 2 ** epochIndex);
  }

  private getRemainingSupply(): number {
    return roundTokenAmount(this.policy.maxSupply - this.mintedSupply);
  }

  private nextRewardBlockHeight(): number {
    const rewardedBlocks = this.tokenEvents.filter((event) => event.kind === "reward" && event.blockHeight).map((event) => event.blockHeight as number);
    return (rewardedBlocks.length > 0 ? Math.max(...rewardedBlocks) : 0) + 1;
  }

  private nextHalvingAtBlock(): number {
    const nextBlock = this.nextRewardBlockHeight();
    return Math.ceil(nextBlock / this.policy.halvingInterval) * this.policy.halvingInterval;
  }

  private resolveFeeCollector(payerId: string, preferredPayeeId?: string): string {
    if (preferredPayeeId && preferredPayeeId !== payerId) {
      return preferredPayeeId;
    }
    return PROTOCOL_TREASURY_OWNER_ID;
  }

  private resolveFeeCollectorType(payerId: string, preferredPayeeId?: string): ProtocolTokenAccount["ownerType"] {
    return preferredPayeeId && preferredPayeeId !== payerId ? "agent" : "system";
  }
}

export function estimateBridgeFee(payloadSize: number, peerCount: number): number {
  return roundTokenAmount(0.0005 + payloadSize * 0.000001 + peerCount * 0.0002);
}

