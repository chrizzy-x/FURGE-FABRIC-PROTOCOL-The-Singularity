import { getChainBlueprint } from "@furge/shared-types";
import { getDemoPlatform } from "@furge/dev-tools";
import { ChainClient } from "@furge/sdk";

export default async function Page() {
  const platform = getDemoPlatform();
  const client = new ChainClient({ chainName: "FinanceChain", transport: platform });
  const workload = getChainBlueprint("FinanceChain").workloads[0]!;
  const cost = await client.estimateQueryCost({ type: workload.type, minAgents: 3 });
  const result = await client.consensusQuery({
    type: workload.type,
    input: workload.input,
    metadata: workload.metadata,
    requesterId: "medical-app",
    minAgents: 3,
    minConfidence: 0.75,
    timeoutMs: 30_000
  });

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Finance Chain</span>
        <h1>Finance Demo</h1>
        <p>Deterministic cost and risk analysis with chain-native token accounting.</p>
      </section>
      <section className="grid cols-2">
        <article className="card">
          <h3>Cost Estimate</h3>
          <div className="metric"><span>Token</span><strong>{cost.token}</strong></div>
          <div className="metric"><span>Estimated cost</span><strong>{cost.amount}</strong></div>
          <ul>{cost.breakdown.map((item) => <li key={item.label}>{item.label}: {item.amount}</li>)}</ul>
        </article>
        <article className="card">
          <h3>Consensus Result</h3>
          <div className="metric"><span>Status</span><strong>{result.consensus.status}</strong></div>
          <div className="metric"><span>Confidence</span><strong>{result.consensus.confidence}</strong></div>
          <p>{result.consensus.rationale}</p>
        </article>
      </section>
    </main>
  );
}