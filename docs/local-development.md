# Local Development Guide

## Prerequisites

- Node.js 24
- Corepack
- Docker Desktop for PostgreSQL and Redis when durable services are desired

## Install

1. Set `COREPACK_HOME` inside the workspace because the default AppData path is restricted in this environment.
2. Run `corepack prepare pnpm@latest --activate`.
3. Run `corepack pnpm install`.

## Infra

- `corepack pnpm infra:up` starts PostgreSQL and Redis.
- `corepack pnpm db:generate` generates Prisma client artifacts.
- `corepack pnpm db:seed` writes deterministic demo state.

## Run

- `corepack pnpm dev` starts the API and the web apps in parallel.
- Each app includes an `.env.example` file and defaults to local in-memory data when explicit service URLs are absent.