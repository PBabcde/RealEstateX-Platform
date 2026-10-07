---
name: RealEstateX cross-tab project deletion
description: Keep editor writes from silently recreating projects deleted from another tab.
---

Editing an existing project must use an update-only IndexedDB transaction. Project creation and restore remain explicit insert paths; do not let stale editor saves act as an upsert.

**Why:** A delayed save from an open tab can otherwise recreate the project after a second tab deletes it, making the deletion appear to have failed.

**How to apply:** When adding editor persistence or background project operations, distinguish updates to existing records from explicit creation/import. Keep the editor subscribed to cross-tab changes and leave the deleted project detached from active state.
