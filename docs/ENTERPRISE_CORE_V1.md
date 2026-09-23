# Enterprise Core V1 implementation review

**Implementation scope:** Trust, audit, recovery foundation, and Express
integration for the official Express + React + TypeScript runtime.

**Excluded by design:** FastAPI, tenant management, authentication, role
issuance, permission policy ownership, and all Script 2 business modules.

## Current-state review

The runnable production service is Express/TypeScript and uses PostgreSQL
through Drizzle when `DATABASE_URL` is configured. Task #3 supplied the
persistent domain tables, importer, and backup/restore tooling. Task #2 owns
the account, tenant, and permission implementation.

This phase adds the shared contracts that future modules can consume without
creating a second runtime or duplicating authorization.

## Delivered layers

### Trust and source governance

`trust_metadata` stores immutable entity identity together with:

- source class: `CANONICAL`, `SHADOW`, `PAPER`, or `LIVE`
- source boundary
- optional source reference
- metadata
- content checksum

The service rejects unknown source classes, missing entity identity, missing
boundaries, and mixed source boundaries. PostgreSQL-backed property and module
writes register canonical trust metadata after the domain write.

### Audit

`audit_events` remains append-only at the application service boundary. The
Enterprise Core service provides:

- UUID event creation
- actor, action, entity, timestamp, and metadata fields
- filtering by actor, entity, and date range
- human-readable event formatting

Existing PostgreSQL property and chat operations continue to write audit events
inside their domain transactions. New modules should call
`recordAuditEvent()` rather than creating a parallel audit table.

### Recovery and integrity

The following PostgreSQL tables provide the recovery foundation:

- `recovery_points` — backup and rollback metadata
- `integrity_checks` — checksum results and failure details
- `core_runtime_state` — `NORMAL`, `READ_ONLY`, or `RECOVERY`

The recovery middleware blocks mutating requests when the runtime is not
`NORMAL`. An integrity mismatch automatically moves the runtime to
`READ_ONLY`. Read requests remain available so operators can inspect state.

### Authorization boundary

The core does not implement authentication or tenant permissions. Sensitive
trust, audit, and recovery operations require an `enterpriseContext` supplied
by Task #2. The adapter accepts an authenticated actor and allows only the
`Admin` or `Operator` roles for core operations.

If Task #2 has not attached that context, the endpoints fail closed with
`503` rather than accepting unauthenticated operational access.

## Database changes

Migration:

```text
lib/db/drizzle/0001_smiling_true_believers.sql
```

The Drizzle journal and snapshot are checked in. The migration adds the three
recovery/trust tables and the runtime-state table without modifying the
existing Task #3 domain tables.

Apply in development with:

```bash
pnpm --filter @workspace/db run push
```

## Integration points for Task #2

Task #2 must attach this shape to authenticated requests:

```ts
{
  actorId: string;
  tenantId?: string;
  roles: readonly string[];
}
```

The core intentionally does not read identity from arbitrary headers or
client-provided IDs.

## API surface

The following read and operational endpoints are mounted under `/api/core`:

- `GET /recovery/status`
- `GET /trust/:entityType/:entityId`
- `GET /audit`
- `POST /recovery/integrity-check`
- `POST /recovery/points`
- `POST /recovery/mode`

All except recovery status require the Task #2 operator context. The recovery
mode endpoint is allowed through the write guard so an authorized operator can
exit `READ_ONLY` or `RECOVERY`.

## Gap analysis and readiness

Completed for this phase:

- Trust metadata schema and validation
- Source-boundary enforcement service
- Audit query and formatting service
- Recovery point metadata
- Integrity checksum checks
- Read-only/recovery write guard
- Express route and startup integration
- Development PostgreSQL schema application

Still required before Enterprise Core V1 can be called production-ready:

- Wire Task #2 authentication middleware to `enterpriseContext`
- Add tenant scoping to trust, audit, and recovery queries
- Add database-level immutability trigger for audit rows
- Add scheduled integrity checks and backup freshness monitoring
- Add automated API tests for role, tenant, and recovery boundaries
- Run a clean-host migration and restore test

**Enterprise Core foundation status:** implementation complete, integration
verification pending Task #2 context wiring.

**Overall RealEstateX production readiness:** remains **54%** until the
authentication boundary, tenant isolation, real document-aware RAG, rate
limiting, and complete live module exposure are verified.