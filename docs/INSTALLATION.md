# Installation and configuration

## 1. Prepare the host

Install Node.js 24, pnpm, Python 3.13, Git, and a process supervisor such as
systemd or PM2. Create a dedicated non-root service user and a writable
application-data directory outside the release checkout.

## 2. Install the release

```bash
git clone <repository-url> realestatex
cd realestatex
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm --filter @workspace/realestatex run build
pnpm --filter @workspace/api-server run build
```

## 3. Configure environment

For a production PostgreSQL-backed runtime:

```text
PORT=8080
NODE_ENV=production
CORS_ORIGINS=https://your-web-domain.example
JSON_BODY_LIMIT=1mb
LOG_LEVEL=info
DATABASE_URL=postgresql://...
```

Apply the schema and import existing JSON data before starting the API:

```bash
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run realestatex:migrate
```

The importer reads `<working-directory>/storage/realestateX` by default. Set
`REALESTATEX_STORAGE_PATH` when the source files are stored elsewhere. The
import is idempotent and can be repeated after a failed run.

For local development without PostgreSQL, omit `DATABASE_URL`. The API then
uses the JSON directory as an explicit single-process fallback. Never use that
mode for multiple API instances or an ephemeral production filesystem.

## 4. Start services

API:

```bash
NODE_ENV=production PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs
```

Web static files are generated at
`artifacts/realestatex/dist/public`. Serve them through the web server or
reverse proxy that also forwards `/api/*` to the API process.

## 5. Verify

```bash
curl -fsS https://your-domain.example/api/healthz
curl -fsS https://your-domain.example/api/suite/overview
```

Do not declare the host production-ready until authentication, authorization,
persistent storage, backup/restore, and the end-to-end test suite have been
completed.