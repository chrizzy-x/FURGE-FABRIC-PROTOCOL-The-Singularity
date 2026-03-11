const sections = [
  ["Architecture", "Source-derived protocol layers, data flow, and package boundaries."],
  ["Local Development", "Corepack, pnpm, Docker Compose, Prisma, and the Windows-specific path workaround."],
  ["Testing", "Unit, integration, and smoke coverage for consensus, bridges, marketplace, explorer, and metaverse."],
  ["Demo Flow", "Medical query, research dependency, finance dependency, bridge execution, marketplace action, and metaverse handoff."],
  ["Assumptions", "Documented defaults where the source material leaves implementation gaps."]
] as const;

export default function Page() {
  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Source Derived Docs</span>
        <h1>Documentation Surface</h1>
        <p>The repository docs are built from the local executive summary, whitepaper, developer guide, economic model, use cases, and roadmap.</p>
      </section>
      <section className="grid cols-2">
        {sections.map(([title, body]) => (
          <article key={title} className="card">
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}