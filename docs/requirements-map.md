# Requirements Map

| Requirement Area | Source Document(s) | Current Repo Implementation |
| --- | --- | --- |
| Layer boundary | Executive Summary, Technical Specification, Real-World Use Cases | No Layer 1 chain logic, no Layer 2 business app logic, and no metaverse chain work in active repo scope |
| Agent coordination | Executive Summary, Technical Specification | Implemented through signed identities, proposals, votes, peer networking, and reputation-weighted BFT consensus |
| Immutable record | Technical Specification | Implemented through hash-linked finalized blocks and audited protocol events |
| Bridge integration | Technical Specification, Real-World Use Cases | Implemented through bridge adapter manifests, validation, execution reports, and fee journaling |
| Durable runtime | Technical Specification | Implemented with Prisma-backed PostgreSQL persistence and Redis snapshot caching |
| Protocol-native token | Economic Model / Tokenomics | `$FURGE` implemented as the protocol-native fixed-cap asset with issuance, fees, transfers, supply state, and invariants |
| Operational surfaces | Executive Summary, Technical Specification | Implemented through `apps/api` plus `apps/web` for public explorer, protected operator console, docs, and branded release media |
| Dedicated cloud environment | Updated scope direction | Render, Cloudflare Pages, and Cloudflare R2 are the intended isolated production targets |
