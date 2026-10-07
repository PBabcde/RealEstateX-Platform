---
name: RealEstateX photo health
description: Keep missing-photo status accurate without changing saved project data.
---

Derive saved-project photo health at read time from the project’s current image references and the IndexedDB image store; do not persist a separate health flag in project settings. When refreshing an open editor after a missed cross-tab update, read its current project references and referenced image records in one readonly transaction.

**Why:** Images may be deleted or recovered independently from the saved scenario, and a suspended tab may miss the notification. Persisted health can become stale, while separate reads can combine references and image availability from different snapshots.

**How to apply:** Project lists should derive photo health alongside the references at read time. Active editor resume handling should refresh the project references, image previews, and missing-photo warnings from one IndexedDB snapshot.
