---
name: RealEstateX photo-reference races
description: Keep source and concept image saves safe when multiple browser tabs update one project.
---

Photo writes must merge against the project currently stored in IndexedDB, commit the image bytes and project references in one readwrite transaction, and clean up only keys that are no longer referenced by any saved project. Ordinary project saves must not overwrite newer photo references from another tab.

**Why:** Separate image saves, project snapshot writes, and cleanup steps let a stale tab restore old keys or delete an image that another tab has just referenced.

**How to apply:** Use one transactional storage mutation for source replacement or concept regeneration. When source replacement clears prior concepts, distinguish concepts present when upload began from concepts generated during the upload so a newer result is not discarded.
