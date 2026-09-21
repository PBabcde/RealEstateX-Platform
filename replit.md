# RealEstateX

RealEstateX is a responsive real-estate intelligence dashboard for managing property portfolios, valuations, rental returns, mortgage scenarios, and market trends.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/realestatex` — runnable React/Vite dashboard with portfolio, calculators, and market views.
- `artifacts/api-server/src/routes/realestatex.ts` — Express API routes for the dashboard.
- `artifacts/api-server/src/lib/realestatex-storage.ts` — atomic JSON persistence and seeded portfolio data.
- `lib/api-spec/openapi.yaml` — source of truth for the generated API client and Zod schemas.
- `core`, `modules/realestateX`, `apps/realestateX_app`, `tests` — Python domain modules, service/router reference implementation, and unit tests from the project brief.
- `storage/realestateX` — JSON persistence files shared by the reference implementation and seeded for local use.

## Architecture decisions

- The application uses JSON persistence for the RealEstateX domain, matching the brief and avoiding an unnecessary database dependency for this phase.
- The Express API is the runnable service for the workspace; the Python modules mirror the requested domain architecture and remain independently testable.
- OpenAPI is the contract boundary: frontend hooks and server validation are generated from the same specification.

## Product

Users can review portfolio totals, inspect saved properties, add/edit/delete properties, calculate valuations, model rental returns, compare mortgage scenarios, and view market direction.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- JSON storage is initialized with three example properties on first API start; writes use temporary files and atomic replacement.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
