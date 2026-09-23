---
name: Drizzle forward migrations
description: How to repair a checked-in PostgreSQL migration after the TypeScript schema has already advanced.
---

When the TypeScript schema contains a column that is absent from an already
checked-in migration, add a new forward migration and journal entry instead of
editing the old migration in place.

**Why:** Existing databases may already have applied the old migration, while
fresh databases and generated declarations need the current schema. Rewriting
history makes those two paths diverge and can break restore or migration
verification.

**How to apply:** Make the forward migration safe for existing rows (backfill
before adding `NOT NULL`), keep the journal in sync, and validate both schema
push and the release restore workflow.

If the journal says a tenant-scope migration exists but a live table is still
missing one of its scoped columns, add a separate compatibility migration
instead of altering the historical entry.

**Why:** The development database can reflect a partially applied or
renamed migration history; current application code must be made safe without
rewriting migration history.

**How to apply:** Inspect the live constraints first, then backfill the
ownerworld tenant, rebuild the composite key, add the foreign key idempotently,
and rerun the tenant-isolation integration test.