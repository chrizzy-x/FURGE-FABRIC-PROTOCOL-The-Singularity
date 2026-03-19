# Testing Guide

## Required Coverage

- Agent identity generation, export, signing, and verification
- Consensus threshold behavior below, at, and above the 2/3 weighted boundary
- Reputation gains and losses after finalized outcomes
- Immutable block append, hash verification, and tamper detection
- Bridge registration and external payload validation hooks
- Local 5-node network bootstrap and peer discovery
- Proposal to vote to finalized block integration flow
- `$FURGE` genesis allocation and supply cap invariants
- `$FURGE` issuance, halving-style reward logic, and fee estimation
- `$FURGE` transfer validation, nonce enforcement, fee settlement, and double-spend prevention
- Durable runtime persistence and restart hydration when `DATABASE_URL` is present
- API routes over the protocol runtime, including public read surfaces and protected operator write routes
- Static web build generation, asset manifest generation, and operational UI packaging

## Commands

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm smoke`
- `node ./scripts/publish-assets.mjs` after `apps/web/dist` exists and R2 credentials are configured
- `node ./scripts/verify-production.mjs` after the production API and site are live

## Durable Verification

If Docker is available in the current session:

1. Run `corepack pnpm infra:up`
2. Run `corepack pnpm db:migrate`
3. Re-run `corepack pnpm test`
4. Re-run `corepack pnpm smoke`

If Docker is not available locally:

1. Point `DATABASE_URL` and `REDIS_URL` to the dedicated cloud services.
2. Run `corepack pnpm db:migrate`.
3. Re-run `corepack pnpm test`.
4. Re-run `corepack pnpm smoke`.
