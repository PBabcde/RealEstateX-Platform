---
name: Drizzle config path quirk
description: Environment-specific behavior when generating Drizzle migrations in this workspace.
---

Drizzle Kit may prepend `./` to the absolute migration directory emitted by the workspace config, causing generation to fail while reading the existing snapshot.

**Why:** The configured migration journal must not be deleted or regenerated from scratch to work around this path handling issue.

**How to apply:** Preserve the existing journal and snapshot; use the database package's schema push workflow for development schema application, and only generate checked-in SQL after validating the configured path handling.