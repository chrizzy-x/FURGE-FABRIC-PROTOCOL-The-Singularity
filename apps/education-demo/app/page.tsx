import { getChainBlueprint } from "@furge/shared-types";
import { getDemoPlatform } from "@furge/dev-tools";
import { ChainClient } from "@furge/sdk";

export default async function Page() {
  const client = new ChainClient({ chainName: "EducationChain", transport: getDemoPlatform() });
  const workload = getChainBlueprint("EducationChain").workloads[0]!;
  const result = await client.consensusQuery({
    type: workload.type,
    input: workload.input,
    metadata: workload.metadata,
    requesterId: "education-portal",
    minAgents: 3,
    minConfidence: 0.75,
    timeoutMs: 30_000
  });

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Education Chain</span>
        <h1>Education Demo</h1>
        <p>Remote attendance, curriculum alignment, and participation validation for students operating through virtual presence.</p>
      </section>
      <section className="card">
        <div className="metric"><span>Status</span><strong>{result.consensus.status}</strong></div>
        <div className="metric"><span>Confidence</span><strong>{result.consensus.confidence}</strong></div>
        <div className="metric"><span>Explorer trace</span><strong>{result.proposal.id}</strong></div>
        <p>{result.consensus.rationale}</p>
      </section>
    </main>
  );
}