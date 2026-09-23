---
name: Audit trigger testing
description: Transaction behavior to account for when testing append-only PostgreSQL triggers.
---

When an append-only trigger rejects an `UPDATE` or `DELETE`, PostgreSQL marks the
current transaction as failed. A second mutation cannot run until the session
rolls back to a savepoint or the whole transaction is rolled back.

**Why:** A test that executes two expected trigger failures in one transaction
will accidentally observe `current transaction is aborted` on the second
operation instead of verifying the trigger itself.

**How to apply:** Put each expected mutation failure behind its own savepoint,
assert the `RESTRICT_VIOLATION` code and exact message, then roll back to and
release that savepoint before testing the next operation.