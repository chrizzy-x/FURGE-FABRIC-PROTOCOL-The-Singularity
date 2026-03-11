import { ChainExplorer, getDemoPlatform } from "@furge/dev-tools";

export default async function Page() {
  const explorer = new ChainExplorer(getDemoPlatform());
  const blocks = await explorer.getRecentBlocks(8);
  const snapshot = await getDemoPlatform().getSnapshot();
  const proposal = snapshot.chains.find((chain) => chain.proposals.length > 0)?.proposals[0];
  const trace = proposal ? await explorer.getProposal(proposal.id) : null;

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Auditability</span>
        <h1>Explorer</h1>
        <p>Trace proposal history, vote weighting, bridge execution, and metaverse session activity through the immutable audit fabric.</p>
      </section>
      <section className="grid cols-2">
        <article className="card">
          <h3>Recent Blocks</h3>
          <ul>
            {blocks.map((block) => (
              <li key={block.id}>{block.chain} :: height {block.height} :: proposals {block.proposalIds.join(", ")}</li>
            ))}
          </ul>
        </article>
        <article className="card">
          <h3>Proposal Trace</h3>
          {trace ? (
            <>
              <p>{trace.proposal.title}</p>
              <div className="metric"><span>Status</span><strong>{trace.proposal.status}</strong></div>
              <div className="metric"><span>Votes</span><strong>{trace.votes.length}</strong></div>
              <div className="metric"><span>Events</span><strong>{trace.events.length}</strong></div>
              <div className="metric"><span>Blocks</span><strong>{trace.blocks.length}</strong></div>
            </>
          ) : (
            <p>No proposal trace is available yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}