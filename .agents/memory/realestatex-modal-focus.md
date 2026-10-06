---
name: RealEstateX modal focus
description: Keyboard focus behavior and browser-test caveats for dialogs in the local-first studio.
---

When a dialog closes, restore focus to a control that is still connected and enabled. Resolve a current DOM target as a fallback when a saved element was unmounted; for asynchronous choices, focus again after the operation finishes if the intended control was temporarily disabled.

**Why:** The project manager can unmount or disable controls while opening a saved project or importing a copy, so an early focus attempt may silently fail. In Chromium fixtures, `HTMLElement.click()` does not move focus like a real user activation, and a synthetic Tab event does not run the browser's native focus movement.

**How to apply:** Use browser-dispatched keyboard events for Tab, Shift+Tab, and Escape tests. Explicitly focus scripted click targets when verifying return-to-trigger behavior, and wait for focus after asynchronous state transitions.
