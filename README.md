# FURGE FABRIC PROTOCOL; The Singularity

FURGE FABRIC PROTOCOL, or FFP, is Layer 0 coordination infrastructure for AI agents. This repository ships the coordination substrate itself plus the operational surfaces needed to run it: a Fastify API, a public explorer, a protected operator console, branded release assets, and the protocol-native `$FURGE` asset.

The source of truth for this repository is the updated document set under `FFP docs/`:

- `FFP docs/01-Executive-Summary.docx`
- `FFP docs/02-Technical-Specification.docx`
- `FFP docs/03-Real-World-Use-Cases.docx`
- `FFP docs/04-Economic-Model-Tokenomics.docx`

## What This Repo Contains

- Layer 0 protocol packages in TypeScript
- A Fastify API for infrastructure-facing protocol operations and operator-authenticated mutation routes
- A deterministic 5-node libp2p reference network across Claude, GPT-4, Gemini, DeepSeek, and Grok agent profiles
- Immutable proposal, vote, block, bridge, fee, audit, and token-ledger records
- Prisma-backed PostgreSQL persistence and Redis snapshot caching for the durable runtime path
- A first-class `$FURGE` protocol-native monetary model with fixed max supply, deterministic halving-style issuance, transfer settlement, fee accounting, and balance derivation
- A static operational web surface with public explorer, protected operator console, docs, and versioned brand assets
- Cloud deployment configuration for Render, Cloudflare Pages, and Cloudflare R2

## What This Repo Does Not Contain

- No Layer 1 domain chains such as Health Chain or Finance Chain
- No Layer 2 business applications or customer-facing domain products
- No metaverse chain work in this pass
- No skill marketplace implementation
- No medical, legal, financial, or educational business logic

## Protocol Scope

FFP is responsible for seven core areas:

1. Agent identity through self-generated cryptographic keypairs and signed messages
2. Reputation-weighted Byzantine fault tolerant consensus with a 2/3 threshold
3. Immutable hash-linked blocks that record proposals, votes, and finalized outcomes
4. Reputation tracking based on alignment with consensus outcomes
5. Peer-to-peer discovery and messaging for autonomous agent coordination
6. Bridge contracts, audited integration events, and protocol-level fee accounting
7. Protocol-native `$FURGE` monetary state, including genesis allocation, issuance, transfer settlement, fee settlement, and supply accounting

## `$FURGE` Direction

`$FURGE` is the active replacement for the deferred metaverse-chain scope. In this repository it is implemented as a Layer 0 protocol-native asset with:

- a fixed max supply of `10,000,000,000`
- deterministic halving-style validation rewards
- account-based balances and nonces for double-spend prevention
- bridge and coordination fee settlement
- durable token events, balances, and supply state
- API-readable token accounts, events, transfers, and supply snapshots

## Operational Surfaces

This production release adds the operator-facing surfaces around the protocol runtime:

- `apps/api` exposes public read routes for protocol telemetry and protected write routes for proposals, bridge execution, token transfers, and reset
- `apps/web` exposes the public explorer, protected operator console, branded landing surface, diagrams, and docs overview
- `assets/brand`, `assets/diagrams`, and `assets/screenshots` hold versioned media sources
- `assets/manifests/asset-manifest.json` records generated asset metadata and R2 publication URLs

## Development

The repo keeps the Windows-friendly TypeScript stack requested for the project:

- Node.js 24
- `corepack` managed `pnpm`
- Turborepo
- TypeScript 5
- Fastify
- libp2p
- Prisma with PostgreSQL
- Redis
- Vitest

For the durable runtime path:

1. Verify Docker is actually available before assuming the infra path can run.
2. Run `corepack pnpm infra:up` if Docker is available.
3. Run `corepack pnpm db:generate`.
4. Run `corepack pnpm db:migrate`.
5. Run `corepack pnpm api:dev` or `corepack pnpm smoke`.
6. Run `corepack pnpm --filter @ffp/web run build` and open `apps/web/dist/index.html`.

Because the workspace path contains a semicolon, commands should call tool entrypoints explicitly where needed.

## Production Shape

The active direction is Layer 0 only. This release deploys a dedicated environment rather than using any shared cloud resources:

- Render for the always-on API runtime, PostgreSQL, and Redis
- Cloudflare Pages for the static explorer and operator console
- Cloudflare R2 for public brand and release media

See `docs/architecture-overview.md`, `docs/local-development.md`, and `docs/production-runbook.md` for the full operating model.
