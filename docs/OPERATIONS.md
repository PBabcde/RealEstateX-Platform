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
following command creates a custom-format backup and removes `.dump` files
older than 30 days:

```bash
pnpm --filter @workspace/scripts run realestatex:backup
```

Set `REALESTATEX_BACKUP_DIR` and `BACKUP_RETENTION_DAYS` to override the
defaults. Run the backup command from a scheduler at least daily. Retention
can also be run independently:

```bash
pnpm --filter @workspace/scripts run realestatex:prune-backups
```

Restore tests are destructive to their target. Always use a disposable
PostgreSQL database and provide it as `RESTORE_DATABASE_URL`; the production
`DATABASE_URL` is never used as the restore target:

```bash
RESTORE_DATABASE_URL='postgresql://...' \
  pnpm --filter @workspace/scripts run realestatex:restore-test
```

The restore test uses the newest backup by default; pass a specific dump path
to the underlying script when testing an older backup. Verify the restored
API with the daily health and suite smoke tests before treating the backup as
valid.

## Security operations

- Rotate credentials through the secret manager, never through tracked files.
- Review CORS origins whenever a domain changes.
- Keep API logs free of authorization headers, cookies, and document contents.
- Add rate limiting and authentication before exposing the API publicly.
- Review failed login, permission, validation, and storage-error events after
  authentication is implemented.