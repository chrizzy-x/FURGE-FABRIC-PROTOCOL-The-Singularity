# Architecture Overview

FFP is the coordination substrate beneath specialized chains and applications. This repository implements that base layer plus the operational surfaces required to run and inspect it in production.

## Core Runtime

The protocol runtime is split into focused packages:

- `shared-types` defines protocol contracts such as agent identities, signed envelopes, proposals, votes, blocks, consensus results, reputation events, bridge events, protocol fee events, token accounts, token events, transfer receipts, and operator auth payloads.
- `protocol-core` owns identity generation, immutable chain state, proposal lifecycle, finalized block append, chain verification, reputation event recording, and audited protocol event storage.
- `consensus` computes reputation-weighted Byzantine fault tolerant outcomes with a 2/3 threshold and timeout support.
- `agent-node` runs a protocol node that signs messages, participates in consensus, publishes blocks, and interacts with peers.
- `bridges` defines the Layer 0 bridge adapter and registry surface.
- `sdk` exposes infrastructure-facing client access to the runtime and API, including operator auth and token routes.
- `dev-tools` provides local network bootstrap, seeded fixtures, PostgreSQL/Redis-backed persistence wiring, smoke flows, and protocol benchmarks.
- `tokenomics` implements the protocol-native `$FURGE` monetary model, including genesis allocation, deterministic block rewards, transfer settlement, fee settlement, and supply accounting.

## API and Web Surfaces

The runtime is exposed through two production surfaces:

- `apps/api` is the always-on Fastify service. Public routes expose read-only protocol state, while operator-authenticated routes handle mutation operations such as proposal submission, bridge execution, token transfers, and reset.
- `apps/web` is a static operational site that combines branded release material, a public explorer, and a protected operator console. It consumes the API directly and reads the generated asset manifest for logos and diagrams.

## Data Flow

1. An agent creates a signed proposal.
2. Peer nodes validate the signature, content, and proposal envelope.
3. Nodes cast signed votes weighted by current reputation.
4. The consensus engine finalizes when support or rejection crosses the BFT threshold, or times out if quorum is not reached.
5. The finalized outcome is appended to the immutable chain as a hash-linked block.
6. Reputation updates are recorded as audited protocol events.
7. The validation block can mint deterministic `$FURGE` reward issuance, subject to the fixed cap and halving schedule.
8. Transfer and fee settlement mutate protocol token balances through a nonce-based account model and append token events plus fee journals.
9. The current runtime snapshot is durably persisted in PostgreSQL and mirrored into Redis as a transient cache projection.
10. The public explorer reads the live protocol state from the API, while the protected operator console calls the authenticated write routes.
11. Brand assets, topology diagrams, and screenshots are versioned in-repo, transformed into hashed web assets during build, and published to Cloudflare R2 for production delivery.

## `$FURGE` Monetary Model

The current implementation uses a rigorous account-based protocol asset model instead of a UTXO graph.

Reasons:

- the existing Layer 0 runtime is agent-centric and keyed around durable agent identity records
- API-driven settlement and persistence recovery are simpler and more deterministic with balances plus nonces
- double-spend prevention is enforced through immutable token journals, nonce monotonicity, and balance checks
- this keeps the repository aligned with FFP's coordination mission rather than turning it into a Bitcoin fork

Bitcoin-inspired properties still preserved here:

- fixed max supply
- scarcity-oriented issuance
- halving-style reward reduction
- validator reward economics
- fee market behavior through deterministic transfer and settlement fees
- ledgered state and supply invariants

## Deployment Topology

The intended production topology is deliberately dedicated to this project:

- Render hosts the API runtime and managed PostgreSQL plus Redis services.
- Cloudflare Pages hosts the static explorer and operator console.
- Cloudflare R2 stores public brand assets, diagrams, and release screenshots.
- GitHub Actions coordinates CI and post-CI deploy steps.

## Boundary Rules

FFP does not contain domain-chain logic, domain-specific Layer 1 tokens, marketplace workflows, metaverse chain behavior, or domain business applications. In this pass, protocol-native `$FURGE` replaces the previously deferred metaverse-chain pillar, while the web surface remains an operational control layer rather than a separate application product.
