---
name: RealEstateX photo-reference races
description: Keep source and concept image saves safe when multiple browser tabs update one project.
---

Photo writes must merge against the project currently stored in IndexedDB and commit image bytes with project references in one readwrite transaction. After a source replacement commits, record stale image keys for retryable cleanup; cleanup must re-read saved-project references in its own transaction and remove only unreferenced keys. Ordinary project saves must not overwrite newer photo references from another tab.

**Why:** Cleanup can fail after the replacement is already valid, and a stale key can become referenced by another saved project before cleanup retries.

**How to apply:** Keep successful source replacements committed even if cleanup fails. Persist the cleanup candidates separately, and re-check every candidate against all projects in the same transaction that deletes images. When source replacement clears prior concepts, distinguish concepts present when upload began from concepts generated during the upload so a newer result is not discarded.
