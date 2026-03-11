import { getChainBlueprint } from "@furge/shared-types";
import { getDemoPlatform } from "@furge/dev-tools";
import { ChainClient } from "@furge/sdk";

export default async function Page() {
  const client = new ChainClient({ chainName: "LegalChain", transport: getDemoPlatform() });
  const workload = getChainBlueprint("LegalChain").workloads[0]!;
  const result = await client.consensusQuery({
    type: workload.type,
    input: workload.input,
    metadata: workload.metadata,
    requesterId: "legal-portal",
    minAgents: 3,
    minConfidence: 0.75,
    timeoutMs: 30_000
  });

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Legal Chain</span>
        <h1>Legal Demo</h1>
        <p>Contract analysis and jurisdiction-aware compliance review with audit traceability.</p>
      </section>
      <section className="card">
        <div className="metric"><span>Status</span><strong>{result.consensus.status}</strong></div>
        <div className="metric"><span>Confidence</span><strong>{result.consensus.confidence}</strong></div>
        <div className="metric"><span>Votes</span><strong>{result.votingRecord.length}</strong></div>
        <p>{result.consensus.rationale}</p>
      </section>
    </main>
  );
}