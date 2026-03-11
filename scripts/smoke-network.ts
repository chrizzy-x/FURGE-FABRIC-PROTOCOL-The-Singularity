import { createProtocolRuntimeStoreFromEnv, createReferenceLocalNetwork } from "../packages/dev-tools/src/index.ts";

const persistence = createProtocolRuntimeStoreFromEnv();
const network = await createReferenceLocalNetwork({ persistence });
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
  requestedBy: network.getSnapshot().agents[0].agentId
});
const snapshot = network.getSnapshot();

let restored: { blockCount: number; bridgeRunCount: number; feeCount: number; restoredProposalIds: string[] } | undefined;
if (network.isPersistenceEnabled()) {
  await network.stop();
  const restarted = await createReferenceLocalNetwork({ persistence: createProtocolRuntimeStoreFromEnv() });
  const restoredSnapshot = restarted.getSnapshot();
  restored = {
    blockCount: restoredSnapshot.blocks.length,
    bridgeRunCount: restoredSnapshot.bridgeReports.length,
    feeCount: restoredSnapshot.feeEvents.length,
    restoredProposalIds: restoredSnapshot.proposals.map((entry) => entry.proposalId)
  };
  console.log(JSON.stringify({ proposal, bridge, snapshot, restored }, null, 2));
  await restarted.stop();
} else {
  console.log(JSON.stringify({ proposal, bridge, snapshot }, null, 2));
  await network.stop();
}
