import {
  PROTOCOL_TOKEN_SYMBOL,
  ProtocolFeeEventSchema,
  type ProtocolFeeEvent,
  makeDeterministicId,
  nowIso
} from "@ffp/shared-types";

export class FurgeFeeLedger {
  private readonly events: ProtocolFeeEvent[] = [];

  recordBridgeFee(input: { payerId: string; referenceId: string; amount: number; payeeId?: string }): ProtocolFeeEvent {
    const event = ProtocolFeeEventSchema.parse({
      feeEventId: makeDeterministicId("fee", `${input.referenceId}:bridge:${this.events.length}`),
      tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
      amount: Number(input.amount.toFixed(6)),
      kind: "bridge",
      payerId: input.payerId,
      payeeId: input.payeeId,
      referenceId: input.referenceId,
      createdAt: nowIso()
    });
    this.events.push(event);
    return event;
  }

  recordCoordinationFee(input: { payerId: string; referenceId: string; amount: number; payeeId?: string }): ProtocolFeeEvent {
    const event = ProtocolFeeEventSchema.parse({
      feeEventId: makeDeterministicId("fee", `${input.referenceId}:coordination:${this.events.length}`),
      tokenSymbol: PROTOCOL_TOKEN_SYMBOL,
      amount: Number(input.amount.toFixed(6)),
      kind: "coordination",
      payerId: input.payerId,
      payeeId: input.payeeId,
      referenceId: input.referenceId,
      createdAt: nowIso()
    });
    this.events.push(event);
    return event;
  }

  importEvent(event: ProtocolFeeEvent): void {
    this.events.push(ProtocolFeeEventSchema.parse(event));
  }

  listEvents(): ProtocolFeeEvent[] {
    return [...this.events];
  }

  getBalanceSheet(): Record<string, number> {
    const balanceSheet: Record<string, number> = {};
    for (const event of this.events) {
      balanceSheet[event.payerId] = Number(((balanceSheet[event.payerId] ?? 0) - event.amount).toFixed(6));
      if (event.payeeId) {
        balanceSheet[event.payeeId] = Number(((balanceSheet[event.payeeId] ?? 0) + event.amount).toFixed(6));
      }
    }
    return balanceSheet;
  }
}

export function estimateBridgeFee(payloadSize: number, peerCount: number): number {
  return Number((0.0005 + payloadSize * 0.000001 + peerCount * 0.0002).toFixed(6));
}
