import { getDemoPlatform } from "@furge/dev-tools";

export default async function Page() {
  const snapshot = await getDemoPlatform().getSnapshot();
  const totals = {
    chains: snapshot.chains.length,
    proposals: snapshot.chains.reduce((sum, chain) => sum + chain.proposals.length, 0),
    bridges: snapshot.chains.reduce((sum, chain) => sum + chain.bridgeRuns.length, 0),
    sessions: snapshot.chains.reduce((sum, chain) => sum + chain.sessions.length, 0)
  };

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Operations</span>
        <h1>Control Plane</h1>
        <p>Operational overview for deployed chains, balances, bridge runs, marketplace activity, and metaverse control state.</p>
        <div className="grid cols-3">
          <div className="card"><h3>{totals.chains}</h3><p>Deployed chains</p></div>
          <div className="card"><h3>{totals.proposals}</h3><p>Protocol proposals</p></div>
          <div className="card"><h3>{totals.bridges + totals.sessions}</h3><p>Bridge and session events</p></div>
        </div>
      </section>
      <section className="grid cols-2">
        {snapshot.chains.map((chain) => (
          <article key={chain.chain} className="card">
            <div className="badge">{chain.config.nativeToken}</div>
            <h3>{chain.chain}</h3>
            <p>{chain.config.description}</p>
            <div className="metric"><span>Agents</span><strong>{chain.agents.length}</strong></div>
            <div className="metric"><span>Proposals</span><strong>{chain.proposals.length}</strong></div>
            <div className="metric"><span>Bridge runs</span><strong>{chain.bridgeRuns.length}</strong></div>
            <div className="metric"><span>Marketplace listings</span><strong>{chain.listings.length}</strong></div>
            <div className="metric"><span>Metaverse sessions</span><strong>{chain.sessions.length}</strong></div>
          </article>
        ))}
      </section>
    </main>
  );
}