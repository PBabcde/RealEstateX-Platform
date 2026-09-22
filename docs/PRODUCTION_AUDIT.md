# RealEstateX production readiness audit

**Audit date:** 2026-09-22  
**Scope:** repository, runtime artifacts, API, frontend, Python reference
layer, persistence, security, tests, deployment configuration, and production
documentation.

## Executive summary

The project builds and the development workflows run. Dependency, SAST, and
privacy/dataflow scans returned no findings. The active API has validation for
the core property and calculator routes, structured logging, atomic
single-file replacement, and a working React dashboard.

It is **not production-ready for public or multi-user operation yet**. The
main blockers are:

1. No authentication or authorization is implemented.
2. The active runtime persists data in local JSON files; the PostgreSQL
   scaffold is empty and unused.
3. The RAG engine is a regex extractor, not retrieval, indexing, chunking,
   embedding, or grounded answer generation.
4. Most of the twenty Phase 2 Python routers are not mounted in the runnable
   Express API.
5. Rate limiting, abuse controls, automated API integration tests, restore
   testing, and coverage reporting are missing.

## Production readiness score

# 54%

This score reflects working builds and a solid prototype foundation, reduced
by the missing security boundary, persistence migration, live Phase 2
coverage, and RAG implementation. A clean dependency scan does not offset
missing application-level controls.

## Critical issues

### C1 — No authentication or authorization

- **Description:** API routes accept requests without a user/session check.
  `userId` for ChatBoxX is client-provided. Property CRUD, chat, and suite
  routes have no ownership or role enforcement.
- **Impact:** Any reachable caller could read, modify, or delete shared
  portfolio data. This is a data exposure and destructive-write risk.
- **Solution:** Add Clerk or another approved identity layer, require
  authenticated requests, derive user identity server-side, add ownership
  filters, and define roles for owners, operators, and administrators.
- **Estimated time:** 2–4 days including integration tests.

### C2 — File-backed persistence is not a production data store

- **Description:** Runtime data is stored under `storage/realestateX` as JSON.
  Atomic rename protects individual writes but there are no transactions,
  locking, concurrent-writer guarantees, schema migrations, or built-in
  recovery.
- **Impact:** Concurrent requests or multiple instances can lose updates.
  A disk failure or bad deployment can lose business data.
- **Solution:** Define active Drizzle tables, migrate properties, calculations,
  chats, users, documents, and audit events to PostgreSQL; add constraints,
  indexes, backup/restore tests, and a controlled data import.
- **Estimated time:** 3–6 days.

### C3 — RAGSuperEngineX is not yet a RAG engine

- **Description:** The current scan extracts a few prices, address-like
  strings, and percentages with regular expressions. There is no upload
  pipeline, document store, text chunking, index, embedding flow, retrieval
  evaluation, citation, or grounded answer generation.
- **Impact:** Assistant answers cannot safely use source documents. Contract,
  valuation, subsidy, tenant, and financing claims would not be traceable.
- **Solution:** Add a controlled document-ingestion pipeline, file-type and
  malware limits, tenant-scoped storage, chunking, embeddings, retrieval,
  source citations, deletion/retention rules, and a quality test set.
- **Estimated time:** 5–10 days depending on provider and document scope.

## High-priority issues

### H1 — Phase 2 registry overstates live capability

- **Description:** `/api/suite/overview` reports all twenty modules online.
  Most module service/router implementations live in the Python reference
  layer and are not mounted in the active Express API.
- **Impact:** Operators and users can interpret registry status as actual
  endpoint availability.
- **Solution:** Mount the supported Phase 2 endpoints in the runnable API or
  expose explicit `implemented`, `referenceOnly`, and `health` states.
- **Estimated time:** 2–5 days.

### H2 — No rate limiting or abuse protection

- **Description:** The API has body limits and input validation, but no
  request throttling, login protection, or per-user quotas.
- **Impact:** Public endpoints can be abused for resource exhaustion or
  repeated writes.
- **Solution:** Add a shared rate limiter at the reverse proxy or use a
  distributed store-backed limiter after database/session work.
- **Estimated time:** 0.5–1 day.

### H3 — Deployment and persistence model are mismatched

- **Description:** The API artifact is configured for an autoscale-style
  production service while runtime state is local JSON. A separate static web
  artifact also needs correct reverse-proxy routing for `/api`.
- **Impact:** Multiple instances or ephemeral storage can diverge or lose
  data. A split deployment can fail through routing or CORS misconfiguration.
- **Solution:** Keep one supervised API instance until PostgreSQL migration, or
  change the deployment model to a persistent VM with explicit data volume.
  Add a smoke test through the public reverse proxy.
- **Estimated time:** 0.5–2 days.

### H4 — Python and Express are parallel sources of behavior

- **Description:** The requested module/service/router architecture exists in
  Python, while Express is the runnable API. Their contracts and calculations
  can drift.
- **Impact:** Tests can pass against code that users never call.
- **Solution:** Select one runtime source of truth, then generate or contract
  test the other layer against shared fixtures.
- **Estimated time:** 2–4 days.

## Medium-priority issues

### M1 — Automated test execution and coverage are not wired

- Python tests use pytest-style functions, but no pytest configuration or
  test script is present in the repository.
- There are no API integration tests for status codes, persistence,
  concurrency, CORS, invalid JSON, or reverse-proxy behavior.
- There are no frontend interaction or accessibility tests.

**Solution:** Add a reproducible test command, pytest dependency/configuration,
API integration tests, frontend smoke tests, and coverage thresholds.

### M2 — Monitoring is limited to structured request logs

Pino logging is configured and redacts authorization/cookie headers, but there
are no application metrics, request duration alerts, storage error alerts,
backup freshness checks, or uptime configuration.

### M3 — Corrupt storage now fails closed, but recovery remains manual

The API no longer silently replaces invalid JSON with a fallback. This avoids
silent data loss but requires a tested restore procedure until the database
migration is complete.

### M4 — Document upload security is not implemented

There is no upload route today, so there is no current upload vulnerability.
When ingestion is added, enforce file size/type limits, content scanning,
non-executable storage, tenant isolation, retention, and safe parser
boundaries.

## Low-priority issues

### L1 — UI accessibility and mobile regression coverage

The frontend has responsive layouts, loading states, error states, semantic
labels in several places, and an error boundary. It does not yet have an
automated keyboard, screen-reader, contrast, or mobile viewport regression
suite.

### L2 — Static market data

The market endpoint currently returns configured JSON values. It should be
clearly labeled as configured/demo data until an authenticated, sourced market
data pipeline is connected.

### L3 — Empty database scaffold

`lib/db` contains the connection and Drizzle configuration but no tables. This
is not a runtime error while JSON mode is active, but it should not be
presented as an active database implementation.

## Review results by area

### Project audit

- Repository structure is coherent but contains two runtime layers.
- No tracked private keys or common API-key prefixes were found.
- The workspace has a pnpm minimum-release-age policy and the dependency scan
  returned zero vulnerabilities.
- `scripts/post-merge.sh` was corrected to use the actual `@workspace/db`
  package name and to skip optional schema push when `DATABASE_URL` is absent.

### Security review

- Dependency audit: 0 critical, 0 high, 0 moderate, 0 low findings.
- SAST scan: no findings.
- HoundDog privacy/dataflow scan: no findings.
- Application-level auth remains the largest security gap.
- API hardening added in this audit: security response headers, configurable
  CORS allowlist, request body limit, safe JSON parse errors, and a generic
  error boundary.

### API review

- Core property and calculator inputs use generated Zod validation.
- Assistant and ChatBoxX now use the generated Zod request/response contracts.
- Structured pino request logging is active and sensitive headers are redacted.
- Error handling and status codes are explicit for validation and not-found
  cases.
- Rate limiting, auth, distributed persistence, and most Phase 2 endpoint
  exposure remain incomplete.

### Frontend review

- Dashboard, property CRUD, calculators, market page, and Suite registry are
  wired to typed API hooks.
- Loading, error, empty, and retry states are present.
- The current visual preview passed at desktop width.
- Automated mobile/accessibility regression testing remains absent.

### Database review

- Drizzle/PostgreSQL connection scaffold exists.
- No application tables or active API queries use it.
- JSON storage is the actual source of truth.
- Backup and restore are operational procedures, not automated guarantees.

### Testing review

Verified in this workspace:

- TypeScript library, API, and frontend typechecks.
- Python compilation.
- Phase 2 domain assertions for assistant, chat, deal score/engine/finance,
  green, risk, and RAG extraction.
- Live health, suite, assistant, and ChatBoxX smoke requests.

Missing before production:

- Reproducible pytest setup and coverage.
- API integration and concurrent-write tests.
- Authentication/authorization tests.
- RAG retrieval quality and citation tests.
- Clean-host deployment and restore tests.

## Benodigde acties vóór Contabo deployment

1. Implement authentication, authorization, tenant ownership, and secure
   session handling.
2. Choose a single production data strategy and migrate active JSON data to
   PostgreSQL, or explicitly run one persistent API instance with tested
   backups as a temporary bridge.
3. Implement and evaluate real document ingestion and retrieval before
   presenting AssistantX as document-aware.
4. Mount Phase 2 routes in the active API or change registry status to
   distinguish reference-only modules.
5. Add rate limiting, API integration tests, authentication tests, and
   concurrency tests.
6. Configure reverse proxy, TLS, CORS, process supervision, firewall, log
   collection, uptime monitoring, and off-host backups.
7. Run a clean-host install, migration, restore, rollback, and full smoke test.
8. Publish only after the score-critical items above are closed and the score
   is recalculated.