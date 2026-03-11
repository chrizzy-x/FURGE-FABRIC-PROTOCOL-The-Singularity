# Testing Guide

## Required Coverage

- Agent identity generation, export, signing, and verification
- Consensus threshold behavior below, at, and above the 2/3 weighted boundary
- Reputation gains and losses after finalized outcomes
- Immutable block append, hash verification, and tamper detection
- Bridge registration and external payload validation hooks
- Local 5-node network bootstrap and peer discovery
- Proposal to vote to finalized block integration flow
- Durable runtime persistence and restart hydration when `DATABASE_URL` is present
- API routes over the protocol runtime

## Commands

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm smoke`
