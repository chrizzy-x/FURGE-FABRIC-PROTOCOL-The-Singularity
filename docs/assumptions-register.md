# Assumptions Register

| Area | Assumption | Why |
| --- | --- | --- |
| Scope precedence | The four `.docx` files in `FFP docs/` override the earlier broad checkpoint | The repo was explicitly re-scoped to Layer 0 only |
| Markdown control files | `BUILD-PROMPT-FOR-CODEX.md` and `CODEX-UPDATE-SCOPE-CLARIFICATION.md` guide scope interpretation but remain untracked | Prompt and update files must stay out of Git |
| API surface | A Fastify API is allowed because it is an infrastructure-facing protocol interface, not a domain product | This preserves the locked stack while respecting Layer 0 boundaries |
| Web surface | A public explorer and protected operator console are allowed because they expose and control the Layer 0 runtime itself rather than a higher-layer business application | The production release needs a real operational surface without crossing into domain-app scope |
| Token supply | `$FURGE` keeps the `10,000,000,000` max supply from the source documents but uses deterministic halving-style issuance in the current implementation | The docs define the cap; the issuance schedule fills the implementation gap for a Bitcoin-inspired local model |
| Token ledger model | The runtime uses an account-based ledger with nonces, immutable token events, and balance derivation instead of a true UTXO model | This fits the existing agent-centric runtime and persistence model while still enforcing double-spend prevention and supply invariants |
| Fee collector fallback | If a deterministic fee path would pay the same actor that submitted the fee-bearing operation, the fee falls back to the protocol treasury account | This prevents self-paying fee loops from making settlement a no-op in the local validator topology |
| Persistence mode | The default zero-config test path can still run in memory, but the live runtime path uses PostgreSQL and Redis when `DATABASE_URL` and `REDIS_URL` are present | This keeps automated tests portable while activating the durable stack for real local runs |
| Docker availability | Docker must be verified in-session before the durable infra path is assumed available | The host previously blocked Docker Desktop through firmware virtualization constraints |
| Cloud environment | No pre-existing cloud environment should be reused for this project | Production deployment must provision a dedicated environment on Render, Cloudflare Pages, and Cloudflare R2 |
| Operator auth | The first production release uses a single operator credential set backed by env variables rather than multi-user RBAC | This is sufficient for the operational control surface without adding an identity product layer |
| Asset publication | Editable source assets stay in-repo while public distribution copies are pushed to Cloudflare R2 | This keeps the repository authoritative while giving production URLs stable delivery |
