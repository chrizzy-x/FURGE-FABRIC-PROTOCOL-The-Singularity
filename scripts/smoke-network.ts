import { createProtocolRuntimeStoreFromEnv, createReferenceLocalNetwork } from "../packages/dev-tools/src/index.ts";

const persistence = createProtocolRuntimeStoreFromEnv();
const network = await createReferenceLocalNetwork({ persistence });
const seededAccounts = network.listTokenAccounts();
const transfer = await network.transferTokens({
  fromAgentId: seededAccounts[1]!.ownerId,
  toAgentId: seededAccounts[2]!.ownerId,
  amount: 25,
  nonce: seededAccounts[1]!.nonce,
  memo: "Protocol smoke transfer"
});
const proposal = await network.submitProposal({
  subject: "Reference network health check",
  summary: "Verify the five-node Layer 0 network can finalize a signed coordination proposal.",
  payload: { check: "health", severity: "info" },
  tags: ["coordination", "audit", "network"],
  expiresInMs: 6_000
});
const bridge = await network.executeBridge({
  adapterId: "loopback-mailbox",
  operation: "send-message",
  payload: {
    address: "ops@furge.local",
    subject: "Protocol smoke",
    body: "Bridge execution proved the Layer 0 bridge path."
  },
  requestedBy: network.getSnapshot().agents[1]!.agentId
});
const snapshot = network.getSnapshot();

let restored:
  | {
      blockCount: number;
      bridgeRunCount: number;
      feeCount: number;
      tokenEventCount: number;
      restoredProposalIds: string[];
    }
  | undefined;
if (network.isPersistenceEnabled()) {
  await network.stop();
  const restarted = await createReferenceLocalNetwork({ persistence: createProtocolRuntimeStoreFromEnv() });
  const restoredSnapshot = restarted.getSnapshot();
  restored = {
    blockCount: restoredSnapshot.blocks.length,
    bridgeRunCount: restoredSnapshot.bridgeReports.length,
    feeCount: restoredSnapshot.feeEvents.length,
    tokenEventCount: restoredSnapshot.tokenEvents.length,
    restoredProposalIds: restoredSnapshot.proposals.map((entry) => entry.proposalId)
  };
  console.log(JSON.stringify({ transfer, proposal, bridge, snapshot, restored }, null, 2));
  await restarted.stop();
} else {
  console.log(JSON.stringify({ transfer, proposal, bridge, snapshot }, null, 2));
  await network.stop();
}
