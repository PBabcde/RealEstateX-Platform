---
name: Offsite backup safety
description: Durable backup operations must not silently fall back to application-local storage.
---

Offsite backup jobs must require a pre-provisioned location outside the application runtime and fail closed when it is unavailable; they must not create a missing mountpoint and treat it as durable storage.

**Why:** A missing mount or deleted runtime must raise an operational alert rather than produce a locally successful backup that disappears with the application.

**How to apply:** Keep the offsite location explicit in deployment configuration, verify it before backup/retention/freshness operations, and use the offsite copy as the default restore source.