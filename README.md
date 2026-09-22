# RealEstateX

RealEstateX is a responsive real-estate intelligence dashboard for property
portfolios, valuations, rental returns, mortgage scenarios, market trends, and
the Phase 2 Master Suite.

## Current state

The workspace contains:

- A React/Vite dashboard in `artifacts/realestatex`.
- An Express API in `artifacts/api-server`.
- An OpenAPI contract in `lib/api-spec/openapi.yaml`.
- A Python reference/domain layer in `modules`, `core`, and
  `apps/realestateX_app`.
- JSON persistence in `storage/realestateX`.
- An empty Drizzle/PostgreSQL scaffold in `lib/db`; it is not the active
  runtime persistence layer yet.

The full production audit is in
[`docs/PRODUCTION_AUDIT.md`](docs/PRODUCTION_AUDIT.md). The most important
pre-deployment blockers are authentication and authorization, replacing
file-based persistence for concurrent production use, wiring the Phase 2
modules into the active API, and implementing real document retrieval for
RAGSuperEngineX.

## Local development

Requirements: Node.js 24, pnpm, and Python 3.13 or compatible.

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/realestatex run dev
```

The managed workflows start the same services automatically. The web
dashboard is served at the root preview path and the API at `/api`.

## Checks

```bash
pnpm run typecheck
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/realestatex run typecheck
python -m compileall -q core modules apps tests
```

The Python tests use pytest-style functions. Install pytest in the target
environment before running them as a suite:

```bash
python -m pytest tests
```

## Runtime configuration

The API requires `PORT`. Optional hardening settings:

- `CORS_ORIGINS`: comma-separated allowed browser origins. In production,
  cross-origin requests are rejected unless listed.
- `JSON_BODY_LIMIT`: maximum JSON and form body size, default `1mb`.
- `LOG_LEVEL`: pino log level, default `info`.

Do not put secrets in tracked files. Use workspace secrets or the deployment
environment for credentials.

## Production documentation

- [Installation](docs/INSTALLATION.md)
- [Deployment checklist](docs/DEPLOYMENT_CHECKLIST.md)
- [Operations and backups](docs/OPERATIONS.md)
- [User guide](docs/USER_GUIDE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Production audit](docs/PRODUCTION_AUDIT.md)