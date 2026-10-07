---
name: RealEstateX modal focus
description: Keyboard focus behavior and browser-test caveats for dialogs in the local-first studio.
---

When a dialog closes, restore focus to a control that is still connected and enabled. Resolve a current DOM target as a fallback when a saved element was unmounted; for asynchronous choices, focus again after the operation finishes if the intended control was temporarily disabled.

**Why:** The project manager can unmount or disable controls while opening a saved project or importing a copy, so an early focus attempt may silently fail. In Chromium fixtures, `HTMLElement.click()` does not move focus like a real user activation, and a synthetic Tab event does not run the browser's native focus movement.

**How to apply:** Use browser-dispatched keyboard events for Tab, Shift+Tab, and Escape tests. Explicitly focus scripted click targets when verifying return-to-trigger behavior, and wait for focus after asynchronous state transitions.

When a dialog's preferred focus target is conditionally rendered during an asynchronous load, keep the trap active but defer the one-time initial focus until that control exists. Use a stable fallback while loading rather than repeatedly reapplying focus on every rerender.

**Why:** The project list hides search controls until its initial storage refresh completes; focusing only on mount puts focus on the close button and never reaches search.

**How to apply:** Separate initial-focus timing from the dialog's lifetime key handler, and mark the preferred focus as applied only once its intended target is available.
