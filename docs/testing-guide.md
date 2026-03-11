# Testing Guide

## Automated Coverage

- Consensus weighting and confidence
- Proposal immutability
- Chain deployment
- Cross-chain orchestration
- Bridge validation and recovery
- Token fee estimation and settlement
- Skill certification and transactions
- Explorer audit timelines
- Metaverse control handoff

## Commands

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm smoke`

## Notes

The repository avoids reliance on live AI providers and external SaaS systems. End-to-end flows use deterministic agents and deterministic mock bridges so tests remain stable.