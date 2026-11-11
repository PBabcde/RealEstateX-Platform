---
name: Drizzle config path quirk
description: Environment-specific behavior when generating Drizzle migrations in this workspace.
---

Drizzle Kit may prepend `./` to the absolute migration directory emitted by the workspace config, causing generation to fail while reading the existing snapshot.

Development schema push can also detect unrelated drift and prompt to truncate existing audit rows to add a constraint. Stop rather than accepting that destructive prompt for an additive schema change; apply only the reviewed additive DDL.

**Why:** The configured migration journal must not be deleted or regenerated from scratch to work around this path handling issue.

**How to apply:** Preserve the existing journal and snapshot. Use schema push only when its proposed changes are safe; if it asks to truncate existing data, do not proceed and use a narrowly scoped additive migration instead.