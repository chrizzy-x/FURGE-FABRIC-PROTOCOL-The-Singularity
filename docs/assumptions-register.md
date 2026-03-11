# Assumptions Register

| Area | Assumption | Rationale |
| --- | --- | --- |
| Education token symbol | `$LEARN` | The source docs specify Education Chain but not a token symbol |
| Metaverse token symbol | `$META` | The source docs specify Metaverse Chain but not a token symbol |
| Test chain token symbol | `$TEST` | Needed for deterministic local smoke and fee flows |
| Skill certification routing | Domain chains certify skills instead of a separate Engineering Chain | The whitepaper gives Engineering Chain as an example, but the required built-in chain list does not include it |
| Local provider strategy | Deterministic adapters represent Claude, GPT-4, Gemini, DeepSeek, and Grok profiles | The roadmap calls for a five-node reference network without requiring outside credentials |
| Durable state fallback | In-memory runtime remains available when PostgreSQL or Redis are unavailable locally | Keeps the local happy path usable while durable adapters still exist in the monorepo |