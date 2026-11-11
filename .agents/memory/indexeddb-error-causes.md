---
name: IndexedDB error causes
description: Preserve the original request error when classifying a failed IndexedDB transaction.
---

When an IndexedDB transaction aborts, its transaction-level error can be less specific than the request error that caused the abort. Capture the failed request's `error` before classifying the transaction failure.

**Why:** Browsers can expose a quota or access error on the failed request while the final transaction state only communicates that the transaction aborted. Using only the final state can hide the action a user should take.

**How to apply:** For atomic IndexedDB writes, retain the first bubbled request error and use it when the transaction aborts; keep rollback behavior independent from how the error is described. Explicitly abort rather than relying on the default action of a cancelable request-error event, since another listener can cancel that action.

When testing whether rejection waits for rollback, observe the abort handler that actually settles the promise, not a separate listener flag.

**Why:** In real Chromium testing, a separate abort-event observer was still unset when the awaiting test resumed, creating a false rollback-timing failure. Observing the settling handler, then comparing full persisted snapshots, checks the actual guarantee without assuming listener/microtask ordering.
