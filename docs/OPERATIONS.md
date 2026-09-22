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

The current API writes JSON with temporary-file replacement. This protects a
single write from partial-file corruption, but it does not provide
transactions, row-level locking, multi-instance coordination, or audit-grade
history. Keep one API process while this storage mode is active.

Do not edit JSON files while the API is running. Stop the API, make a copy,
validate JSON, then restart and run the smoke tests.

## Database migration

`lib/db` currently contains only the Drizzle/PostgreSQL connection scaffold
and no application tables. A migration must define the property, calculation,
chat, module, document, user, and audit models before the API switches to it.
Plan the migration as a dual-read or one-time import with a verified backup,
not as an unreviewed destructive push.

## Security operations

- Rotate credentials through the secret manager, never through tracked files.
- Review CORS origins whenever a domain changes.
- Keep API logs free of authorization headers, cookies, and document contents.
- Add rate limiting and authentication before exposing the API publicly.
- Review failed login, permission, validation, and storage-error events after
  authentication is implemented.