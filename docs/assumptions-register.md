# Assumptions Register

| Area | Assumption | Why |
| --- | --- | --- |
| Scope precedence | The four `.docx` files in `FFP docs/` override the earlier broad checkpoint | The user explicitly re-scoped the repo to Layer 0 only |
| Markdown control files | `BUILD-PROMPT-FOR-CODEX.md` and `CODEX-UPDATE-SCOPE-CLARIFICATION.md` guide scope interpretation but remain untracked | The user explicitly asked that prompt and update files stay out of Git |
| API surface | A Fastify API is allowed because it is an infrastructure-facing protocol interface, not a user product UI | This preserves the locked stack while respecting Layer 0 boundaries |
| Token scope | Only `$FURGE` protocol fee events remain in active repo scope | Chain-native token economics belong to Layer 1 |
| Persistence mode | The default zero-config test path can still run in memory, but the live local runtime path uses PostgreSQL and Redis when `DATABASE_URL` and `REDIS_URL` are present | This keeps automated tests portable while activating the durable stack for real local runs |
