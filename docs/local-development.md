# Local Development Guide

## Prerequisites

- Node.js 24
- Corepack
- `pnpm` through Corepack
- PostgreSQL and Redis only if you want the durable runtime path
- Docker Desktop only if Docker is actually available on this machine

## Install

1. Set `COREPACK_HOME` inside the workspace because the default AppData location is restricted in this environment.
2. Run `corepack prepare pnpm@latest --activate`.
3. Run `corepack pnpm install`.
4. Run `corepack pnpm db:generate`.

## Run In-Memory Path

- Start the protocol API with `corepack pnpm api:dev`.
- Bootstrap the deterministic 5-node reference network with `corepack pnpm network:bootstrap`.
- Run the end-to-end protocol smoke flow with `corepack pnpm smoke`.
- Build the operational web surface with `corepack pnpm --filter @ffp/web run build`.
- Open `apps/web/dist/index.html` after the build completes.

## Run Durable Path

Only use this path after confirming Docker is available in the current session.

1. Run `corepack pnpm infra:up`.
2. Run `corepack pnpm db:migrate`.
3. Run `corepack pnpm smoke`.
4. Rebuild `apps/web` if you need the latest API base URL or asset base URL embedded into `config.js`.

The durable path persists:

- proposals and finalized blocks
- reputation events
- bridge runs and protocol fee events
- `$FURGE` token accounts
- `$FURGE` token events
- `$FURGE` supply state

## Operator Auth

- Use `apps/api/.env.example` to set `OPERATOR_USERNAME`, `OPERATOR_PASSWORD`, or `OPERATOR_PASSWORD_HASH`.
- Local development defaults to `operator / operator` only when production env variables are absent.
- Set `CORS_ALLOWED_ORIGINS` when the web surface is not being opened directly from the local filesystem.

## Workspace Notes

- The workspace path contains a semicolon. Prefer explicit tool entrypoints instead of relying on `.bin` path injection.
- Prompt and planning files must remain untracked.
- If Docker is unavailable locally, validate the durable path against the dedicated cloud database and Redis services instead of assuming containers will work.
- The production plan provisions a project-specific environment on Render, Cloudflare Pages, and Cloudflare R2 rather than using any shared or pre-existing cloud environment.
