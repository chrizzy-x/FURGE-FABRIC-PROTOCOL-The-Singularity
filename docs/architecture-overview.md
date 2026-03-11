# Architecture Overview

Furge is implemented as a monorepo with one shared operational backend and multiple domain-specific UIs.

## Layers

1. **Protocol packages** model chains, proposals, consensus, bridges, tokens, skills, and metaverse state.
2. **API layer** exposes those capabilities through Fastify with typed JSON contracts.
3. **Web surfaces** render explorer, control-plane, documentation, and domain demo views with shared workspace packages.
4. **Local network tooling** launches a deterministic five-node libp2p fabric for seeded workflows and tests.

## Data Flow

1. A client submits a protocol query through `ChainClient` or a demo form.
2. `protocol-core` records a proposal and emits an append-only audit event.
3. `agent-node` profiles evaluate the proposal with chain-aware deterministic logic.
4. `consensus` tallies reputation-weighted votes and finalizes, rejects, or times out the proposal.
5. `tokenomics` computes fees and balances, `bridges` can execute mock external actions, `marketplace` can certify or transfer skills, and `metaverse` can append presence/session events.
6. `ChainExplorer` reconstructs a verifiable timeline from the hash-linked event chain.

## Durable And Transient State

- PostgreSQL via Prisma stores chain, agent, proposal, vote, event, balance, bridge, marketplace, and metaverse records.
- Redis is reserved for transient queueing, cache, and fanout concerns.
- The demo runtime also supports an in-memory mode so the local happy path can be exercised without outside credentials.