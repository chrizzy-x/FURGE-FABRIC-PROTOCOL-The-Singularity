import { getChainBlueprint } from "@furge/shared-types";
import { getDemoPlatform } from "@furge/dev-tools";
import { ChainClient, CrossChainBridge, executeMarketplacePurchase, recordPresence } from "@furge/sdk";

export default async function Page() {
  const platform = getDemoPlatform();
  const medical = new ChainClient({ chainName: "MedicalChain", transport: platform });
  const research = new ChainClient({ chainName: "ResearchChain", transport: platform });
  const finance = new ChainClient({ chainName: "FinanceChain", transport: platform });
  const bridge = new CrossChainBridge([medical, research, finance]);

  const medicalWorkload = getChainBlueprint("MedicalChain").workloads[0]!;
  const researchWorkload = getChainBlueprint("ResearchChain").workloads[0]!;
  const financeWorkload = getChainBlueprint("FinanceChain").workloads[0]!;

  const results = await bridge.coordinatedQuery({
    primary: {
      chain: "MedicalChain",
      type: medicalWorkload.type,
      input: medicalWorkload.input,
      metadata: medicalWorkload.metadata,
      minAgents: 3,
      minConfidence: 0.8,
      timeoutMs: 30_000,
      requesterId: "medical-app"
    },
    dependencies: [
      {
        chain: "ResearchChain",
        type: researchWorkload.type,
        input: researchWorkload.input,
        metadata: researchWorkload.metadata,
        minAgents: 3,
        minConfidence: 0.78,
        timeoutMs: 30_000,
        requesterId: "medical-app"
      },
      {
        chain: "FinanceChain",
        type: financeWorkload.type,
        input: financeWorkload.input,
        metadata: financeWorkload.metadata,
        minAgents: 3,
        minConfidence: 0.75,
        timeoutMs: 30_000,
        requesterId: "medical-app"
      }
    ]
  });

  const medicalResult = results.MedicalChain!;
  const researchResult = results.ResearchChain!;
  const financeResult = results.FinanceChain!;
  const snapshot = await platform.getSnapshot();
  const listing = snapshot.chains.flatMap((chain) => chain.listings).find((item) => item.active);
  const purchase = listing
    ? await executeMarketplacePurchase(platform, { listingId: listing.id, buyerId: "marketplace-buyer" })
    : snapshot.transactions.at(-1);
  const bridgeRun = await platform.executeBridge({
    chain: "MedicalChain",
    proposalId: medicalResult.proposal.id,
    serviceId: "medicalchain-fixture",
    direction: "outbound",
    payload: {
      requesterId: "medical-app",
      carePlan: medicalResult.consensus.rationale,
      researchTrace: researchResult.proposal.id,
      financeTrace: financeResult.proposal.id
    }
  });
  const presence = await recordPresence(platform, {
    agentId: snapshot.chains.find((chain) => chain.chain === "MetaverseChain")!.agents[0]!.agentId,
    scene: "Global Clinic Lobby",
    mode: "takeover",
    device: "phone",
    approved: true,
    notes: "Human operator reviewed the triage outcome and assumed control for bedside explanation."
  });

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Flagship Flow</span>
        <h1>Medical Demo</h1>
        <p>Protocol query, cross-chain dependencies, bridge action, marketplace transaction, and metaverse handoff executed in one seeded path.</p>
      </section>
      <section className="grid cols-2">
        <article className="card">
          <h3>Consensus Outputs</h3>
          <div className="metric"><span>Medical</span><strong>{medicalResult.consensus.status}</strong></div>
          <div className="metric"><span>Research</span><strong>{researchResult.consensus.status}</strong></div>
          <div className="metric"><span>Finance</span><strong>{financeResult.consensus.status}</strong></div>
          <p>{medicalResult.consensus.rationale}</p>
        </article>
        <article className="card">
          <h3>Operational Proof</h3>
          <div className="metric"><span>Bridge</span><strong>{bridgeRun.status}</strong></div>
          <div className="metric"><span>Marketplace</span><strong>{purchase ? purchase.mode : "pending"}</strong></div>
          <div className="metric"><span>Metaverse</span><strong>{presence.mode}</strong></div>
          <p>Explorer trace anchor: <code>{medicalResult.proposal.id}</code></p>
        </article>
      </section>
    </main>
  );
}