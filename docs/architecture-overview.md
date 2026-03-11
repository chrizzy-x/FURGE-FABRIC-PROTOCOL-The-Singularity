# Architecture Overview

FFP is the coordination substrate beneath specialized chains and applications. This repository implements only that base layer.

## Core Runtime

The protocol runtime is split into focused packages:

- `shared-types` defines protocol contracts such as agent identities, signed envelopes, proposals, votes, blocks, consensus results, reputation events, bridge events, and fee events.
- `protocol-core` owns identity generation, immutable chain state, proposal lifecycle, finalized block append, chain verification, and reputation event recording.
- `consensus` computes reputation-weighted Byzantine fault tolerant outcomes with a 2/3 threshold and timeout support.
- `agent-node` runs a protocol node that signs messages, participates in consensus, publishes blocks, and interacts with peers.
- `bridges` defines the Layer 0 bridge adapter and registry surface.
- `sdk` exposes infrastructure-facing client access to the runtime and API.
- `dev-tools` provides local network bootstrap, seeded fixtures, PostgreSQL/Redis-backed persistence wiring, smoke flows, and protocol benchmarks.
- `tokenomics` is limited to Layer 0 `$FURGE` coordination fee events and journals.

## Data Flow

1. An agent creates a signed proposal.
2. Peer nodes validate the signature, content, and proposal envelope.
3. Nodes cast signed votes weighted by current reputation.
4. The consensus engine finalizes when support or rejection crosses the BFT threshold, or times out if quorum is not reached.
5. The finalized outcome is appended to the immutable chain as a hash-linked block.
6. Reputation updates and protocol fee events are recorded as audited protocol events.
7. The current runtime snapshot is durably persisted in PostgreSQL and mirrored into Redis as a transient cache projection.
8. Bridge adapters register external capabilities and emit audited bridge events when external payloads are validated.

## Boundary Rules

FFP does not contain domain-chain logic, domain-specific tokens, marketplace workflows, metaverse behavior, or end-user applications. Those sit above this layer and consume FFP as infrastructure.
