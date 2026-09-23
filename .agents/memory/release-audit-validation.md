---
name: Release audit validation target
description: Release checks must run database-backed audit validation against the disposable restore target, not the source connection.
---

Release restore validation must execute the audit test suite in a child process
with the disposable database URL. The database client is created when the
module is imported, so changing the parent process environment after import
would otherwise validate the source database.

**Why:** A passing audit check against the source database does not prove that
the restored release backup retained its sequence and hash-chain integrity.

**How to apply:** Restore first, then run both the append-only trigger and
sequence/hash-chain checks with the target connection; propagate any non-zero
exit status so release cleanup still runs but the release fails.