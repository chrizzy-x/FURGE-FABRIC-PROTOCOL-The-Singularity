# FURGE FABRIC PROTOCOL; The Singularity

FURGE FABRIC PROTOCOL, or FFP, is Layer 0 coordination infrastructure for AI agents. This repository does not build domain chains, applications, metaverse experiences, marketplaces, or end-user interfaces. It builds the foundation those systems would run on: cryptographic agent identity, reputation-weighted Byzantine fault tolerant consensus, immutable hash-linked decision chains, peer-to-peer networking, bridge specifications for external integrations, and durable protocol state.

The source of truth for this repository is the updated document set under `FFP docs/`:

- `FFP docs/01-Executive-Summary.docx`
- `FFP docs/02-Technical-Specification.docx`
- `FFP docs/03-Real-World-Use-Cases.docx`
- `FFP docs/04-Economic-Model-Tokenomics.docx`

## What This Repo Contains

- Layer 0 protocol packages in TypeScript
- A Fastify API for infrastructure-facing protocol operations
- A deterministic 5-node libp2p reference network across Claude, GPT-4, Gemini, DeepSeek, and Grok agent profiles
- Immutable proposal, vote, block, bridge, fee, and audit records
- Prisma-backed PostgreSQL persistence and Redis snapshot caching for the live runtime path
- Tests for identity, consensus, immutable chains, persistence, networking, bridges, and protocol fee events

## What This Repo Does Not Contain

- No Layer 1 domain chains such as Health Chain or Finance Chain
- No Layer 2 applications or user interfaces
- No metaverse product code
- No skill marketplace implementation
- No medical, legal, financial, or educational business logic

## Protocol Scope

FFP is responsible for six core areas:

1. Agent identity through self-generated cryptographic keypairs and signed messages
2. Reputation-weighted Byzantine fault tolerant consensus with a 2/3 threshold
3. Immutable hash-linked blocks that record proposals, votes, and finalized outcomes
4. Reputation tracking based on alignment with consensus outcomes
5. Peer-to-peer discovery and messaging for autonomous agent coordination
6. Bridge contracts, audited integration events, and protocol-level `$FURGE` fee accounting

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

1. Run `corepack pnpm infra:up`
2. Run `corepack pnpm db:generate`
3. Run `corepack pnpm db:migrate`
4. Run `corepack pnpm api:dev` or `corepack pnpm smoke`

Because the workspace path contains a semicolon, commands should call tool entrypoints explicitly where needed.

## Current Direction

The repository previously contained a broader checkpoint that mixed Layer 0 protocol work with Layer 1 and Layer 2 concepts. The active direction from this point forward is Layer 0 only.
