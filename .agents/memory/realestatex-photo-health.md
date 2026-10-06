---
name: RealEstateX photo health
description: Keep missing-photo status accurate without changing saved project data.
---

Derive saved-project photo health at read time from the project’s current image references and the IndexedDB image store; do not persist a separate health flag in project settings.

**Why:** Images may be deleted or recovered independently from the saved scenario. A stored health flag can become stale and would unnecessarily alter the project record.

**How to apply:** Any project list or recovery surface that shows photo health should read image availability alongside the project references and refresh after image mutations.
