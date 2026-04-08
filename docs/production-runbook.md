# Production Runbook

## Target Topology

- Render web service: `furge-fabric-protocol-api`
- Render PostgreSQL: `furge-fabric-protocol-postgres`
- Render Redis: `furge-fabric-protocol-redis`
- Cloudflare Pages project: `furge-fabric-protocol-the-singularity`
- Cloudflare R2 bucket: `furge-fabric-protocol-assets`

## Render Setup

1. Import `render.yaml` as a new blueprint in Render.
2. Confirm the web service, PostgreSQL database, and Redis service are all project-specific.
3. Confirm the API service uses the repo root, `corepack enable && corepack pnpm install --frozen-lockfile && corepack pnpm db:generate && corepack pnpm build` as the build command, `corepack pnpm db:migrate` as the pre-deploy command, `corepack pnpm --filter @ffp/api run start` as the start command, and `/health` as the health check path.
4. Set runtime env vars: `NODE_ENV=production`, `NODE_VERSION=24.0.0`, `API_HOST=0.0.0.0`, `API_PORT=10000`, `LOG_LEVEL=info`, `FFP_AUTO_BOOTSTRAP=true`, `ENABLE_PRODUCTION_RESET=false`, `DATABASE_URL`, `REDIS_URL`, `OPERATOR_USERNAME`, `OPERATOR_JWT_SECRET`, and either `OPERATOR_PASSWORD_HASH` or `OPERATOR_PASSWORD`.
5. For a Render-only API release, leave `CORS_ALLOWED_ORIGINS` unset until a browser client exists. For a browser client, set it to the exact web origin.
6. Run the deploy once and verify `/health`, `/snapshot`, `/token/supply`, and `/token/events` before moving to any web deployment.

## Cloudflare Pages Setup

1. Create the Pages project `furge-fabric-protocol-the-singularity`.
2. Configure build-time env vars:
   - `FFP_PUBLIC_API_BASE_URL`
   - `FFP_PUBLIC_ASSET_BASE_URL`
3. Store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub Actions secrets.
4. Use the `deploy` GitHub Actions workflow to publish the built static site.

## Cloudflare R2 Setup

1. Create the bucket `furge-fabric-protocol-assets`.
2. Enable a public delivery URL or map a public domain to the bucket.
3. Store these GitHub Actions secrets:
   - `CLOUDFLARE_R2_ACCESS_KEY_ID`
   - `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
   - `CLOUDFLARE_R2_BUCKET`
   - `CLOUDFLARE_R2_PUBLIC_BASE_URL`
4. Build the web app before publishing assets so `assets/manifests/asset-manifest.json` and `apps/web/dist/assets` both exist.
5. Run `node ./scripts/publish-assets.mjs` to upload hashed asset files and rewrite the manifest with the public URLs.

## GitHub Actions Secrets

Required secrets for the full release path:

- `RENDER_DEPLOY_HOOK_URL`
- `FFP_PUBLIC_API_BASE_URL`
- `FFP_PRODUCTION_API_BASE_URL`
- `FFP_PRODUCTION_WEB_URL`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_R2_PUBLIC_BASE_URL`

## Post-Deploy Verification

Run the live verification after API, Pages, and R2 are deployed:

1. `node ./scripts/verify-production.mjs`
2. Check `/health`
3. Check `/snapshot`
4. Check `/token/supply`
5. Check `/token/events`
6. Open the public explorer and confirm it renders live state
7. Log in to the operator console and confirm protected routes still require bearer auth

## Safety Notes

- Keep `ENABLE_PRODUCTION_RESET=false` unless an explicit emergency maintenance window requires it.
- Do not use the local development operator password in production.
- Prefer `OPERATOR_PASSWORD_HASH` over plain `OPERATOR_PASSWORD` for deployed environments.
- If local Docker remains unavailable, use the dedicated Render PostgreSQL and Redis services for durable verification before the public release.
