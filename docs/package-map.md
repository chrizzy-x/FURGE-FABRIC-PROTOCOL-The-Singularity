# Package Map

| Package | Responsibility |
| --- | --- |
| `@ffp/shared-types` | Core protocol contracts, schemas, token types, operator auth payloads, and shared utility helpers |
| `@ffp/protocol-core` | Agent identity, immutable chains, proposal lifecycle, reputation events, audited protocol events, and chain verification |
| `@ffp/consensus` | Reputation-weighted BFT consensus and timeout handling |
| `@ffp/agent-node` | Protocol node runtime, signing, validation, and peer participation |
| `@ffp/bridges` | Bridge adapter contracts, registry, and audited bridge event flow |
| `@ffp/sdk` | Infrastructure-facing client surface for nodes, API consumers, operator auth, and token routes |
| `@ffp/dev-tools` | Local 5-node reference network, PostgreSQL/Redis runtime persistence, seeded `$FURGE` state, smoke helpers, and benchmarks |
| `@ffp/tokenomics` | Protocol-native `$FURGE` issuance, transfer settlement, fee settlement, balance derivation, and supply accounting |
| `@ffp/api` | Fastify API exposing health, protocol state, bridges, fees, `$FURGE` state, and protected operator write routes |
| `@ffp/web` | Static brand site, public explorer, protected operator console, and asset-manifest-aware operational UI |
