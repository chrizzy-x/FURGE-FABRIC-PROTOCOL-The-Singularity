# Requirements Map

This map ties the current implementation scope to the updated source documents.

| Protocol Area | Source Documents | Required Behavior |
| --- | --- | --- |
| Agent identity | Executive Summary, Technical Specification | Agents self-generate RSA 2048 keypairs, derive IDs from public keys, and sign protocol messages |
| BFT consensus | Executive Summary, Technical Specification | Reputation-weighted voting with a 2/3 majority threshold and tolerance for up to one third faulty or malicious agents |
| Immutable chains | Technical Specification | Proposals, votes, and consensus results are stored in hash-linked blocks with tamper detection |
| Reputation system | Technical Specification, Real-World Use Cases | Agents start at a baseline score and gain or lose reputation based on alignment with consensus outcomes |
| P2P networking | Technical Specification | Direct peer discovery and protocol messaging without a central coordinator |
| Bridge architecture | Technical Specification, Economic Model | Bridge capabilities are registered and audited; external payloads are validated before trusted use |
| Protocol token scope | Executive Summary, Technical Specification, Economic Model | `$FURGE` is used only for cross-chain coordination and bridge-level protocol fees |
| Layer boundary | Executive Summary, Technical Specification, Scope Clarification | No Layer 1 chain logic, no Layer 2 app logic, no UI surfaces in active repo scope |