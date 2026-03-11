# FURGE FABRIC PROTOCOL; The Singularity

FURGE FABRIC PROTOCOL, or FFP, is Layer 0 coordination infrastructure for AI agents. This repository does not build domain chains, applications, metaverse experiences, marketplaces, or end-user interfaces. It builds the foundation those systems would run on: cryptographic agent identity, reputation-weighted Byzantine fault tolerant consensus, immutable hash-linked decision chains, peer-to-peer networking, and bridge specifications for external integrations.

The source of truth for this repository is the updated document set under `FFP docs/`:

- `FFP docs/01-Executive-Summary.docx`
- `FFP docs/02-Technical-Specification.docx`
- `FFP docs/03-Real-World-Use-Cases.docx`
- `FFP docs/04-Economic-Model-Tokenomics.docx`

## What This Repo Contains

- Layer 0 protocol packages in TypeScript
- A Fastify API for infrastructure-facing protocol operations
- Local node and network tooling for deterministic 5-node protocol validation
- Tests for identity, consensus, immutable chains, networking, bridges, and protocol fee events
- Documentation that explains the Layer 0 boundary clearly

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
6. Bridge contracts and audited integration events for external systems

## Development

The repo keeps the existing Windows-friendly TypeScript toolchain:

- Node.js 24
- `corepack` managed `pnpm`
- Turborepo
- TypeScript 5
- Fastify
- libp2p
- Prisma and Redis kept as stack components for protocol infrastructure work
- Vitest for automated coverage

Because the workspace path contains a semicolon, commands should call tool entrypoints explicitly where needed.

## Current Direction

The repository previously contained a broader checkpoint that mixed Layer 0 protocol work with Layer 1 and Layer 2 concepts. That checkpoint is being corrected through follow-up commits. The active direction from this point forward is Layer 0 only.