# Requirements Map

This matrix ties each major implementation pillar to the source documents that define it.

| Pillar | Source Material | Implementation Notes |
| --- | --- | --- |
| Protocol identity, proposal lifecycle, immutable audit trail | Executive Summary, Technical Whitepaper, Developer Documentation | Implemented as append-only, hash-linked events with proposal and vote records, audit retrieval, and explorer timelines |
| Reputation-weighted consensus | Executive Summary, Technical Whitepaper, Developer Documentation, Roadmap | Implemented with weighted voting, confidence aggregation, decay, threshold handling, timeout, and rejection paths |
| Specialized chains | Technical Whitepaper, Developer Documentation, Use Cases, Roadmap | Seven built-in chains with domain rules, token symbols, seeded agents, and demo workloads |
| Bridge architecture | Technical Whitepaper | `FurgeBridge` contract with sync-in, sync-out, consensus validation, execution, failure handling, and recovery reporting |
| SDK and client access | Developer Documentation | `ChainClient` and `CrossChainBridge` provide typed query access, cost estimation, and explorer linkage |
| Tokenomics | Economic Model, Developer Documentation | `$FURGE` protocol fees, chain-native balances, estimation, journals, and settlement |
| Skill marketplace | Technical Whitepaper, Economic Model | Skill certification, listing, rental, licensing, bundling, and marketplace settlement |
| Metaverse presence and control handoff | Use Cases, Technical Whitepaper | Presence state, watch/takeover/hybrid/review modes, session history, and explorer visibility |
| Docs and operator surfaces | Cover, Developer Documentation, Roadmap | README, docs app, control plane, explorer, and demo guides |
| Five-node reference network | Roadmap, Executive Summary | Local deterministic profiles for Claude, GPT-4, Gemini, DeepSeek, and Grok |