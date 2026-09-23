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

- authenticated tenant ID
- source class: `CANONICAL`, `SHADOW`, `PAPER`, or `LIVE`
- source boundary
- optional source reference
- metadata
- content checksum

The service rejects unknown source classes, missing entity identity, missing
boundaries, and mixed source boundaries. PostgreSQL-backed property and module
writes register canonical trust metadata after the domain write.

### Audit

`audit_events` is append-only at both the PostgreSQL and application
boundaries. The Enterprise Core service provides:

- authenticated tenant scoping for every read and append;
- database-enforced rejection of `UPDATE` and `DELETE`;
- sequential `sequence_id` values;
- a `previous_hash`/`event_hash` SHA-256 chain;
- integrity validation for sequence and hash continuity;
- UUID event creation
- actor, action, entity, timestamp, and metadata fields
- filtering by actor, entity, and date range
- human-readable event formatting

Existing PostgreSQL property and chat operations continue to write audit events
inside their domain transactions. New modules should call
`recordAuditEvent()` rather than creating a parallel audit table.

See `docs/ENTERPRISE_CORE.md` for the trigger message, chain algorithm, and
database-backed immutability test.

### Recovery and integrity

The following PostgreSQL tables provide the recovery foundation:

- `recovery_points` — tenant-scoped backup and rollback metadata
- `integrity_checks` — tenant-scoped checksum results and failure details
- `core_runtime_state` — tenant-scoped `NORMAL`, `READ_ONLY`, or `RECOVERY`

The recovery middleware loads the authenticated tenant context before checking
runtime state and blocks mutating core requests when that tenant is not
`NORMAL`. An integrity mismatch automatically moves only that tenant to
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
lib/db/drizzle/0003_audit_append_only_chain.sql
lib/db/drizzle/0004_enterprise_core_tenant_scope.sql
```

The Drizzle journal and migration are checked in. The tenant migration adds
`tenant_id` to all Enterprise Core tables, backfills existing rows to the
personal `ownerworld` tenant, and changes trust/runtime uniqueness to include
the tenant. The audit sequence remains globally unique while each tenant has
its own hash-chain predecessor.

Apply in development with:

```bash
pnpm --filter @workspace/db run push
```

## Integration points for Task #2

The API now attaches this shape to authenticated Enterprise Core requests:

```ts
{
  actorId: string;
  tenantId: string;
  roles: readonly string[];
  permissions: readonly string[];
  correlationId: string;
}
```

`tenantId` is loaded from the authenticated user's server-side database record.
The `x-tenant-id` header is never used for identity or tenant selection.
The temporary default tenant is the personal `ownerworld` tenant. The current
`admin` role maps to the core `Admin` role; `owner` and `member` do not receive
operator access.

## API surface

The following read and operational endpoints are mounted under `/api/core`:

- `GET /recovery/status`
- `GET /trust/:entityType/:entityId`
- `GET /audit`
- `POST /recovery/integrity-check`
- `POST /recovery/points`
- `POST /recovery/mode`

All Enterprise Core endpoints require the authenticated request context. Trust,
audit, and recovery mutation endpoints additionally require the `Admin` or
`Operator` core role. The recovery mode endpoint is allowed through the write
guard so an authorized operator can exit `READ_ONLY` or `RECOVERY`.

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
- Database-enforced append-only audit history and its integration test
- Tenant-scoped Enterprise Core queries and mutations
- Ownerworld backfill for existing Enterprise Core rows
- Cross-tenant API isolation coverage

Still required before Enterprise Core V1 can be called production-ready:

- Add scheduled integrity checks and backup freshness monitoring
- Run a clean-host migration and restore test

**Enterprise Core foundation status:** implementation complete, with database
immutability and audit-chain verification included.

**Overall RealEstateX production readiness:** remains **54%** until the
authentication boundary, tenant isolation, real document-aware RAG, rate
limiting, and complete live module exposure are verified.