import { getDemoPlatform } from "@furge/dev-tools";
import { recordPresence } from "@furge/sdk";

export default async function Page() {
  const platform = getDemoPlatform();
  const snapshot = await platform.getSnapshot();
  const profile = snapshot.chains.find((chain) => chain.chain === "MetaverseChain")!.agents[0]!;
  const session = await recordPresence(platform, {
    agentId: profile.agentId,
    scene: "Boardroom Aether",
    mode: "hybrid",
    device: "vr",
    approved: true,
    notes: "Hybrid handoff for shared control during a virtual board meeting."
  });

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Metaverse Chain</span>
        <h1>Metaverse Demo</h1>
        <p>Persistent character presence with watch, takeover, hybrid, and review control modes.</p>
      </section>
      <section className="card">
        <div className="metric"><span>Agent</span><strong>{profile.displayName}</strong></div>
        <div className="metric"><span>Mode</span><strong>{session.mode}</strong></div>
        <div className="metric"><span>Scene</span><strong>{session.scene}</strong></div>
        <p>{session.notes}</p>
      </section>
    </main>
  );
}