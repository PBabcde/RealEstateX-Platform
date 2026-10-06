---
name: IndexedDB error causes
description: Preserve the original request error when classifying a failed IndexedDB transaction.
---

When an IndexedDB transaction aborts, its transaction-level error can be less specific than the request error that caused the abort. Capture the failed request's `error` before classifying the transaction failure.

**Why:** Browsers can expose a quota or access error on the failed request while the final transaction state only communicates that the transaction aborted. Using only the final state can hide the action a user should take.

**How to apply:** For atomic IndexedDB writes, retain the first bubbled request error and use it when the transaction aborts; keep rollback behavior independent from how the error is described.
