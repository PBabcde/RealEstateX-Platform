# Deployment, rollback, monitoring, and backup checklist

## Before deployment

- [ ] Complete authentication and authorization for every data endpoint.
- [ ] Choose one persistence strategy. Recommended: migrate active runtime
      data to PostgreSQL before enabling multiple API instances.
- [ ] Configure `CORS_ORIGINS` with the exact public web origin.
- [ ] Configure secrets outside the repository.
- [ ] Build from a clean checkout with `pnpm install --frozen-lockfile`.
- [ ] Run workspace typechecks, Python compilation, API integration tests, and
      the frontend build.
- [ ] Confirm `/api/healthz` and `/api/suite/overview`.
- [ ] Confirm the reverse proxy serves the SPA fallback and forwards `/api`.
- [ ] Confirm the process runs as a non-root user.
- [ ] Confirm TLS, DNS, firewall, and SSH hardening.

## Production checklist

- [ ] Use a persistent application-data volume if JSON storage remains
      temporarily enabled.
- [ ] Keep only one API instance while JSON storage is active.
- [ ] Capture structured logs centrally and redact authorization, cookies, and
      personal document data.
- [ ] Add uptime monitoring for `/api/healthz`.
- [ ] Monitor 4xx/5xx rates, latency, process restarts, disk usage, and
      storage write failures.
- [ ] Define retention for property, chat, document, and audit data.

## Rollback checklist

1. Stop new traffic or put the reverse proxy in maintenance mode.
2. Record the current release identifier and API logs.
3. Stop the API before restoring file-backed data.
4. Restore the last known-good application release.
5. Restore the matching data snapshot; never mix a future schema with an old
   release.
6. Run health, CRUD, calculator, chat, and suite smoke tests.
7. Re-enable traffic and monitor errors for at least one release window.

If the application has migrated to PostgreSQL, use a database snapshot and a
reversible migration plan. Do not use `drizzle-kit push --force` as a rollback
mechanism.

## Backup checklist

- [ ] Take encrypted, versioned backups of the persistent data directory or
      PostgreSQL database.
- [ ] Configure `REALESTATEX_OFFSITE_BACKUP_DIR` on a separate durable storage
      location outside the application runtime; never use the workspace or
      container filesystem.
- [ ] Schedule `realestatex:backup` at least daily and
      `realestatex:backup-freshness` at least hourly; alert on non-zero exit.
- [ ] Confirm the 30-day offsite retention job is scheduled and logs removals.
- [ ] Assign the operations/on-call owner for failed backup and freshness
      alerts.
- [ ] Include a restore timestamp and release identifier.
- [ ] Test a restore from the offsite copy on a clean host before the first
      public launch.
- [ ] Record recovery point and recovery time objectives.