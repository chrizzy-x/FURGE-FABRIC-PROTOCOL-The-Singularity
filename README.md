# FURGE FABRIC PROTOCOL; The Singularity

Furge is a Windows-friendly TypeScript monorepo that turns the source whitepaper, executive summary, developer guide, economic model, use cases, and roadmap into a runnable first-pass intelligence coordination platform. The repository includes a Fastify API, Next.js control surfaces, a deterministic five-node libp2p reference network, built-in domain chains, a typed SDK, bridge framework, marketplace, token accounting, metaverse session control, and seed-driven demo applications.

## Source-Derived Scope

The current implementation is anchored to the local source documents in this repository:

- `00-FURGE-FABRIC-PROTOCOL-The-Singularity-COVER.docx`
- `01-Executive-Summary.docx`
- `02-Technical-Whitepaper.docx`
- `03-Developer-Documentation.docx`
- `04-Economic-Model.docx`
- `05-Use-Cases-Applications.docx`
- `06-Roadmap-Implementation-Plan.docx`

Tracked documentation that maps implementation choices back to those documents lives under `docs/`.

## Workspace Layout

- `apps/api`: Fastify service exposing protocol, explorer, bridge, marketplace, token, and metaverse routes
- `apps/control-plane`: operational dashboard for deployment status, balances, reputation, bridge runs, and session control
- `apps/explorer`: audit timelines, voting traces, bridge execution, marketplace activity, and metaverse history
- `apps/docs`: architecture, setup, testing, demo, package map, requirements matrix, and assumptions register
- `apps/*-demo`: deterministic domain workflows for medical, finance, research, legal, education, and metaverse chains
- `packages/*`: shared protocol packages and stable public APIs

## Local Development

The repository is designed for Node.js 24 and `corepack`-managed `pnpm`. Because this workspace path contains a semicolon, all scripts invoke tool entrypoints directly instead of relying on `node_modules/.bin` being injected into `PATH`.

1. `set COREPACK_HOME=%CD%\\.corepack`
2. `corepack prepare pnpm@latest --activate`
3. `corepack pnpm install`
4. Copy `.env.example` into app-local `.env.local` files when you want to run the web surfaces against the Fastify API
5. Use `corepack pnpm infra:up` when Docker Desktop is available
6. Use `corepack pnpm db:generate` and `corepack pnpm db:seed` to prepare seeded state

## Verification

Primary verification commands:

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm smoke`

See `docs/testing-guide.md` and `docs/demo-guide.md` for subsystem-specific coverage and the end-to-end proof flow.