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

- Start the protocol API with the root API script.
- Start the deterministic local network with the dev-tools bootstrap script.
- Run benchmarks and smoke helpers from `scripts/`.

## Workspace Notes

The workspace path contains a semicolon. Prefer explicit Node entrypoints instead of relying on `.bin` path injection.