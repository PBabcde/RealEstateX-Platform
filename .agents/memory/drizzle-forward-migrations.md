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