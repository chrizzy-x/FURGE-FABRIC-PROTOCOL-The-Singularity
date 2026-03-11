import { getChainBlueprint } from "@furge/shared-types";
import { getDemoPlatform } from "@furge/dev-tools";
import { ChainClient } from "@furge/sdk";

export default async function Page() {
  const platform = getDemoPlatform();
  const client = new ChainClient({ chainName: "ResearchChain", transport: platform });
  const workload = getChainBlueprint("ResearchChain").workloads[0]!;
  const result = await client.consensusQuery({
    type: workload.type,
    input: workload.input,
    metadata: workload.metadata,
    requesterId: "medical-app",
    minAgents: 3,
    minConfidence: 0.78,
    timeoutMs: 30_000
  });
  const snapshot = await platform.getSnapshot();

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Research Chain</span>
        <h1>Research Demo</h1>
        <p>Evidence provenance, trial discovery, and skill inventory for collaborative research workflows.</p>
      </section>
      <section className="grid cols-2">
        <article className="card">
          <h3>Evidence Query</h3>
          <div className="metric"><span>Status</span><strong>{result.consensus.status}</strong></div>
          <div className="metric"><span>Support</span><strong>{result.consensus.supportWeight}</strong></div>
          <p>{result.consensus.rationale}</p>
        </article>
        <article className="card">
          <h3>Certified Skills</h3>
          <ul>
            {snapshot.skills.filter((skill) => skill.chain === "ResearchChain").map((skill) => (
              <li key={skill.id}>{skill.capability} :: {skill.level} :: score {skill.reputationScore}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}