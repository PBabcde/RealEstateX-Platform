---
name: Drizzle migration output
description: Workspace-specific requirement for generating and checking PostgreSQL migrations.
---

Drizzle Kit expects its configured output directory to contain a migration
journal before generating a new migration. Keep the configured output path
stable and regenerate the journal/migration together when recreating an empty
migration directory. Use relative `schema` and `out` paths in the workspace
config; this Drizzle Kit version malformed absolute `__dirname` paths during
`generate`.

**Why:** The workspace uses a checked-in `lib/db/drizzle` directory, and
removing its metadata makes `drizzle-kit generate` fail instead of rebuilding
the directory.

**How to apply:** Run generation from `lib/db` with the configured relative
paths and preserve the generated `meta/_journal.json` alongside migration SQL.