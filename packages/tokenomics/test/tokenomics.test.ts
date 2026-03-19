import { describe, expect, test } from "vitest";
import { DEFAULT_FURGE_POLICY, FurgeFeeLedger, PROTOCOL_TREASURY_ACCOUNT_ID } from "@ffp/tokenomics";

const agentId = (seed: string) => seed.repeat(64).slice(0, 64);

describe("tokenomics", () => {
  test("seeds deterministic genesis allocation", () => {
    const ledger = new FurgeFeeLedger();
    const state = ledger.seedGenesis([agentId("a"), agentId("b")], "2026-03-19T00:00:00.000Z");

    expect(state.tokenAccounts.find((account) => account.accountId === PROTOCOL_TREASURY_ACCOUNT_ID)?.balance).toBe(DEFAULT_FURGE_POLICY.genesisTreasuryAllocation);
    expect(state.tokenAccounts.find((account) => account.ownerId === agentId("a"))?.balance).toBe(DEFAULT_FURGE_POLICY.genesisAgentGrant);
    expect(state.tokenSupply.mintedSupply).toBe(
      DEFAULT_FURGE_POLICY.genesisTreasuryAllocation + DEFAULT_FURGE_POLICY.genesisAgentGrant * 2
    );
  });

  test("issues deterministic validation rewards with halving", () => {
    const ledger = new FurgeFeeLedger({ genesisTreasuryAllocation: 0, genesisAgentGrant: 0 });
    ledger.seedGenesis([agentId("a")], "2026-03-19T00:00:00.000Z");

    const first = ledger.recordValidationReward({
      validatorId: agentId("a"),
      blockHeight: 1,
      referenceId: "block-1",
      createdAt: "2026-03-19T00:00:01.000Z"
    });
    const halved = ledger.recordValidationReward({
      validatorId: agentId("a"),
      blockHeight: DEFAULT_FURGE_POLICY.halvingInterval + 1,
      referenceId: "block-33",
      createdAt: "2026-03-19T00:00:02.000Z"
    });

    expect(first?.amount).toBe(DEFAULT_FURGE_POLICY.initialReward);
    expect(halved?.amount).toBe(DEFAULT_FURGE_POLICY.initialReward / 2);
  });

  test("settles transfers, fees, and supply without minting new units", () => {
    const ledger = new FurgeFeeLedger({ genesisTreasuryAllocation: 0, genesisAgentGrant: 500 });
    ledger.seedGenesis([agentId("a"), agentId("b"), agentId("c")], "2026-03-19T00:00:00.000Z");
    const beforeSupply = ledger.getSupplySnapshot().mintedSupply;

    const receipt = ledger.recordTransfer({
      fromAgentId: agentId("b"),
      toAgentId: agentId("c"),
      amount: 100,
      nonce: 0,
      referenceId: "block-transfer-1",
      validatorId: agentId("a"),
      blockHeight: 2,
      createdAt: "2026-03-19T00:00:03.000Z",
      memo: "deterministic transfer"
    });

    expect(receipt.senderAccount.balance).toBeLessThan(400);
    expect(receipt.recipientAccount.balance).toBe(600);
    expect(receipt.validatorAccount.balance).toBeGreaterThan(500);
    expect(ledger.getSupplySnapshot().mintedSupply).toBe(beforeSupply);
  });

  test("rejects double spending through nonce reuse", () => {
    const ledger = new FurgeFeeLedger({ genesisTreasuryAllocation: 0, genesisAgentGrant: 500 });
    ledger.seedGenesis([agentId("a"), agentId("b"), agentId("c")], "2026-03-19T00:00:00.000Z");

    ledger.recordTransfer({
      fromAgentId: agentId("b"),
      toAgentId: agentId("c"),
      amount: 20,
      nonce: 0,
      referenceId: "block-transfer-2",
      validatorId: agentId("a"),
      blockHeight: 3,
      createdAt: "2026-03-19T00:00:04.000Z"
    });

    expect(() =>
      ledger.recordTransfer({
        fromAgentId: agentId("b"),
        toAgentId: agentId("c"),
        amount: 20,
        nonce: 0,
        referenceId: "block-transfer-3",
        validatorId: agentId("a"),
        blockHeight: 4,
        createdAt: "2026-03-19T00:00:05.000Z"
      })
    ).toThrow(/nonce mismatch/);
  });

  test("enforces the max supply invariant", () => {
    const ledger = new FurgeFeeLedger({
      maxSupply: 75,
      genesisTreasuryAllocation: 0,
      genesisAgentGrant: 0,
      initialReward: 50,
      halvingInterval: 1
    });
    ledger.seedGenesis([agentId("a")], "2026-03-19T00:00:00.000Z");

    ledger.recordValidationReward({ validatorId: agentId("a"), blockHeight: 1, referenceId: "block-cap-1" });
    ledger.recordValidationReward({ validatorId: agentId("a"), blockHeight: 2, referenceId: "block-cap-2" });
    const exhausted = ledger.recordValidationReward({ validatorId: agentId("a"), blockHeight: 3, referenceId: "block-cap-3" });

    expect(ledger.getSupplySnapshot().mintedSupply).toBe(75);
    expect(exhausted).toBeNull();
  });

  test("records bridge fees against protocol balances", () => {
    const ledger = new FurgeFeeLedger({ genesisTreasuryAllocation: 0, genesisAgentGrant: 100 });
    ledger.seedGenesis([agentId("a"), agentId("b")], "2026-03-19T00:00:00.000Z");

    const feeEvent = ledger.recordBridgeFee({
      payerId: agentId("a"),
      payeeId: agentId("b"),
      referenceId: "bridge-run-1",
      amount: 1.5,
      createdAt: "2026-03-19T00:00:06.000Z"
    });

    expect(feeEvent.amount).toBe(1.5);
    expect(ledger.getAgentAccount(agentId("a")).balance).toBe(98.5);
    expect(ledger.getAgentAccount(agentId("b")).balance).toBe(101.5);
  });
});
