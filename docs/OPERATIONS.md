# Operations and administration

## Daily checks

```bash
curl -fsS http://127.0.0.1:8080/api/healthz
curl -fsS http://127.0.0.1:8080/api/suite/overview
```

Check the process supervisor, structured API logs, disk space, and the
persistent data location. A healthy process is not proof that data writes are
safe; inspect write errors and backup freshness separately.

## Data operations

PostgreSQL is the production storage backend. When `DATABASE_URL` is set, the
API stores properties, calculation/module data, chat sessions/messages, and
audit events in PostgreSQL. Property changes and their audit events are written
in one transaction, and chat messages are stored as rows, so multiple API
processes can safely share the same database.

Audit events are append-only at the database boundary as well as in the
application. PostgreSQL rejects every `UPDATE` and `DELETE` on `audit_events`
with a `RESTRICT_VIOLATION`; direct database access cannot silently rewrite or
remove audit history. Inserts remain allowed for the application and import
paths. Verify this protection and the audit hash chain after applying
migrations with:

```bash
pnpm --filter @workspace/scripts run test:audit-immutability
```

Without `DATABASE_URL`, the API deliberately uses the JSON files under
`storage/realestateX` as a local-development fallback. This mode uses atomic
temporary-file replacement but has no transactions, row locks, or
multi-instance coordination. Run exactly one API process in this mode and
never edit the files while the API is running.

## Database setup and JSON import

The schema is defined in `lib/db/src/schema/index.ts` and the checked-in
Drizzle migration is in `lib/db/drizzle/`. Provision PostgreSQL, set
`DATABASE_URL` through the secret manager, then apply the schema:

```bash
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run realestatex:migrate
```

The importer reads the existing JSON files, upserts every property and module
record, and imports chat messages and legacy audit entries. It uses stable
identifiers and `ON CONFLICT` upserts, so it is safe to run again after a
partial import. Set `REALESTATEX_STORAGE_PATH` when the source files are not in
the default workspace storage directory. Take a backup before importing.

## Backups, restore tests, and retention

`pg_dump` and `pg_restore` must be installed on the operations host. The
following command creates a custom-format backup in a local staging directory,
copies it atomically to the configured offsite directory, and removes `.dump`
files older than 30 days from both locations:

```bash
REALESTATEX_OFFSITE_BACKUP_DIR=/mnt/backup-vault/realestatex \
pnpm --filter @workspace/scripts run realestatex:backup
```

`REALESTATEX_OFFSITE_BACKUP_DIR` is required and must point to a durable,
encrypted and versioned storage location outside the application runtime
(for example, a separately mounted backup volume or a storage-provider mount).
Do not point it at the workspace, container filesystem, or a subdirectory of
`REALESTATEX_BACKUP_DIR`. `REALESTATEX_BACKUP_DIR` only contains local staging
copies. Set it and `BACKUP_RETENTION_DAYS` to override their defaults. The
central retention policy is the offsite `.dump` cleanup performed by both the
backup command and this independent job:

```bash
REALESTATEX_OFFSITE_BACKUP_DIR=/mnt/backup-vault/realestatex \
pnpm --filter @workspace/scripts run realestatex:prune-backups
```

Run the backup job at least daily. The freshness alert must run after it (and
at least hourly) using the default 26-hour threshold, which is intentionally
longer than one daily interval:

```bash
REALESTATEX_OFFSITE_BACKUP_DIR=/mnt/backup-vault/realestatex \
  pnpm --filter @workspace/scripts run realestatex:backup-freshness
```

Set `BACKUP_FRESHNESS_HOURS` to change the alert threshold. The check reads the
newest `.dump` in the offsite location and exits non-zero with an alert when it
is missing or too old. The operations/on-call owner is responsible for
investigating a failed backup or freshness check and recording the incident.

Restore tests are destructive to their target. Always use a disposable
PostgreSQL database and provide it as `RESTORE_DATABASE_URL`; the production
`DATABASE_URL` is never used as the restore target:

```bash
RESTORE_DATABASE_URL='postgresql://...' \
  pnpm --filter @workspace/scripts run realestatex:restore-test
```

The restore test uses the newest offsite backup by default; pass a specific
dump path to the underlying script when testing an older backup. Verify the
restored API with the daily health and suite smoke tests before treating the
backup as valid.

Every tagged release runs the same restore check in CI. The workflow creates
the source schema and fixture data, writes a custom-format backup, creates a
unique disposable PostgreSQL database, and runs the release restore command:

```bash
RESTORE_ADMIN_DATABASE_URL='postgresql://...' \
  pnpm --filter @workspace/scripts run realestatex:release-restore-test
```

The release check validates the five RealEstateX tables
(`properties`, `module_data`, `chat_sessions`, `chat_messages`, and
`audit_events`), requires imported property and RealEstateX module records,
validates every tenant's audit sequence and hash chain, runs the append-only
trigger test, logs the number of validated events, and drops the temporary
database even when restore or validation fails.

## Retiring legacy OIDC session rows

The legacy `public.sessions` table is retained for schema and compatibility
reasons, but the current API authenticates through Clerk. A repository review
found no active API reader or writer for `public.sessions`; its current
references are the schema and test fixtures. The local `users` table remains
the application identity/role/tenant mapping and must not be removed. The
separate `chat_sessions` table contains application chat history and is not an
authentication session store.

Retention policy: keep every legacy OIDC row until at least 30 days after its
UTC `expire` timestamp. Keep all unexpired rows and rows inside that 30-day
grace period. After migration approval and confirmation that no environment
still runs an OIDC consumer, only rows beyond that cutoff may be removed.
Token-field counts in the preview are informational; the cleanup selects rows
by expiry, never prints token values or session IDs, and never removes token
fields from an active row.

The cleanup command changes data only; it does not create, drop, or alter
tables, columns, indexes, or constraints. Its delete statement targets only
`public.sessions`. It does not touch `users`, application/chat data, foreign
keys, or any audit table. If the actual sessions table has an unexpected
column shape, any foreign-key relationship, or any user-defined trigger, the
command stops without changing it. These checks prevent cascading deletes or
trigger side effects from reaching application or audit data.

For each environment separately:

1. Record approval of the Clerk migration and confirm no legacy OIDC process
   or deployment still consumes these rows. Do not proceed if either is
   uncertain.
2. Configure that environment's `DATABASE_URL`,
   `REALESTATEX_DEPLOYMENT_ENV` (`development`, `staging`, or `production`),
   and an environment-specific `REALESTATEX_OFFSITE_BACKUP_DIR`. Create a new
   offsite backup with `realestatex:backup`; then restore that exact dump to a
   disposable database. Set `DUMP_PATH` to the created dump and
   `RESTORE_DATABASE_URL` to the disposable target, then run:

   ```bash
   pnpm --filter @workspace/scripts run realestatex:restore-test -- "$DUMP_PATH"
   ```

   Never use the source database as the restore target. Do not continue if
   backup or restore validation fails.

3. Preview with the expected database name. The command also prints the
   connected database identity and refuses a mismatch:

   ```bash
   pnpm --filter @workspace/scripts run realestatex:retire-legacy-sessions -- \
     preview --environment production --database realestatex_production
   ```

4. Review the preview's eligible count and obtain explicit deletion approval
   in the migration/change record. Apply only with that record's reference,
   the exact preview count, and the environment/database confirmation. The
   environment variable must match `--environment`, and the connected database
   name must match `--database`:

   ```bash
   pnpm --filter @workspace/scripts run realestatex:retire-legacy-sessions -- \
     apply --environment production --database realestatex_production \
     --expected-rows 12 --approval-reference CHG-1234 \
     --confirm production/realestatex_production
   ```

   Replace the sample environment, database name, row count, and reference
   with the reviewed values. `apply` takes a table lock, rechecks the preview
   count, and deletes in a transaction; any mismatch rolls the transaction
   back. It requires `REALESTATEX_DEPLOYMENT_ENV` to be set to the selected
   environment. Running `preview` alone never deletes data.

5. Save the preview and apply output with the approval record, then run a new
   preview to verify the eligible count is zero. Repeat separately for every
   approved environment; never reuse one environment's preview or database
   name for another.

## Enterprise Core recovery operations

The Enterprise Core stores trust metadata, audit events, recovery points, and
integrity-check results in PostgreSQL. A successful integrity check returns a
checksum; a mismatch automatically changes the runtime to `READ_ONLY`, which
keeps reads available and blocks mutating API requests.

Operational endpoints are mounted under `/api/core`. Audit, trust, integrity,
recovery-point, and mode operations require the authenticated `Admin` or
`Operator` context supplied by the account/permission layer. They must not be
exposed through an unauthenticated reverse-proxy path.

Before enabling the public API, verify that the authentication middleware
populates `req.enterpriseContext` with the actor ID, tenant ID, and roles. The
core deliberately does not accept identity from request headers or request
bodies.

## Security operations

- Rotate credentials through the secret manager, never through tracked files.
- Review CORS origins whenever a domain changes.
- Keep API logs free of authorization headers, cookies, and document contents.
- Add rate limiting and authentication before exposing the API publicly.
- Review failed login, permission, validation, and storage-error events after
  authentication is implemented.
