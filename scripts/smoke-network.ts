import { createReferenceLocalNetwork } from "../packages/dev-tools/src/index.ts";

const network = await createReferenceLocalNetwork();
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
console.log(JSON.stringify({ proposal, bridge, snapshot: network.getSnapshot() }, null, 2));
await network.stop();
