# RealEstateX

RealEstateX is a responsive real-estate intelligence dashboard for managing property portfolios, valuations, rental returns, mortgage scenarios, and market trends.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `DATABASE_URL` — PostgreSQL connection string for the concurrent production storage backend

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
- `artifacts/api-server/src/routes/phase2.ts` — live registry endpoint for the 20-module Master Suite.
- `artifacts/api-server/src/routes/assistant-chat.ts` — AssistantX and ChatBoxX API flows.
- `artifacts/api-server/src/lib/realestatex-storage.ts` — PostgreSQL-backed storage with an explicit atomic-JSON local fallback.
- `lib/api-spec/openapi.yaml` — source of truth for the generated API client and Zod schemas.
- `core`, `modules/realestateX`, `apps/realestateX_app`, `tests` — Python domain modules, service/router reference implementation, and unit tests from the project brief.
- `storage/realestateX` — source data for local fallback and the repeatable PostgreSQL importer.
- `artifacts/realestatex/src/pages/pages.tsx` — the user-facing Suite registry at `/suite`.

## Architecture decisions

- Authentication uses Replit-managed Clerk with same-origin session cookies. Local users retain application roles and tenant membership. Verified `sessionClaims.userId` resolves the original users ID; Clerk-native IDs are only for Clerk API operations. Legacy sessions and users tables remain intact.
- Clerk publishing supplies `VITE_CLERK_PROXY_URL` automatically; it is intentionally empty in development. Keep the canonical unconditional `proxyUrl` prop and hostname-derived publishable key. Do not add a hardcoded `/api/__clerk` fallback or production-only client branching. The backend proxy is mounted before body parsers. See `.local/skills/clerk-auth/references/setup-and-customization.md` and https://docs.replit.com/features/auth-and-identity/clerk-auth.
- Clerk migration verification is documented in `artifacts/api-server/tests/clerk-migration-verification.md`; real cookie-based browser checks are separate from isolated bridge and photo/storage fixtures.

- PostgreSQL is the production source of truth for the RealEstateX domain; JSON remains an explicit one-process local-development fallback and import source.
- The Express API is the runnable service for the workspace; the Python modules mirror the requested domain architecture and remain independently testable.
- OpenAPI is the contract boundary: frontend hooks and server validation are generated from the same specification.
- Phase 2 keeps assistant and RAG behavior provider-neutral, so a real model or document provider can be connected without changing the Suite registry or chat contract.

## Product

Users can review portfolio totals, inspect saved properties, add/edit/delete properties, calculate valuations, model rental returns, compare mortgage scenarios, view market direction, inspect all 20 Phase 2 modules, and use AssistantX/ChatBoxX through the API.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- Without `DATABASE_URL`, JSON storage is initialized with three example properties on first API start; writes use temporary files and atomic replacement.
- With `DATABASE_URL`, apply the Drizzle schema and run `pnpm --filter @workspace/scripts run realestatex:migrate` before starting the API.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
