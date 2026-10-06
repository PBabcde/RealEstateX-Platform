---
name: Cross-tab project import safety
description: Keep duplicate-checking and project backup writes race-safe across tabs in the same browser.
---

Single-project backup imports must hold one same-origin exclusive browser lock across duplicate comparison and the IndexedDB save. Explicit extra-copy imports still use that lock for their write, but intentionally skip the duplicate decision. Do not silently fall back to an unlocked check-then-write when browser locking is unavailable.

**Why:** Two tabs can both see no existing match before either one saves, and then create duplicate projects. The lock is browser-local and preserves the app's local-only data model.

**How to apply:** Keep the comparison and normal import inside the same lock callback. Any intentional duplicate path must serialize through the same lock, while retaining the user's explicit choice to create a copy.
