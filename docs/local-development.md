# Local Development Guide

## Prerequisites

- Node.js 24
- Corepack
- `pnpm` through Corepack
- Docker Desktop if you want local PostgreSQL and Redis available for future protocol infrastructure work

## Install

1. Set `COREPACK_HOME` inside the workspace because the default AppData location is restricted in this environment.
2. Run `corepack prepare pnpm@latest --activate`.
3. Run `corepack pnpm install`.

## Run

- Start the protocol API with `corepack pnpm api:dev`.
- Bootstrap the deterministic 5-node reference network with `corepack pnpm network:bootstrap`.
- Run the end-to-end protocol smoke flow with `corepack pnpm smoke`.
- Run the consensus benchmark with `corepack pnpm bench`.

## Workspace Notes

The workspace path contains a semicolon. Prefer explicit Node entrypoints instead of relying on `.bin` path injection.
