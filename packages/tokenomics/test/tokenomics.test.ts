import { describe, expect, test } from "vitest";
import { FurgeFeeLedger, estimateBridgeFee } from "@ffp/tokenomics";

describe("tokenomics", () => {
  test("estimates and records bridge fees", () => {
    const fee = estimateBridgeFee(512, 5);
    const ledger = new FurgeFeeLedger();
    const event = ledger.recordBridgeFee({
      payerId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      payeeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      referenceId: "bridge-run-1",
      amount: fee
    });

    expect(event.amount).toBe(fee);
    expect(ledger.getBalanceSheet()[event.payerId]).toBeLessThan(0);
    expect(ledger.getBalanceSheet()[event.payeeId!]).toBeGreaterThan(0);
  });
});
