---
name: Browser IndexedDB testing
description: Running reliable browser-level tests against asynchronous IndexedDB storage in this workspace.
---

Headless Chromium's `--dump-dom` can capture the page before asynchronous IndexedDB work finishes, even with a virtual-time budget. Use the DevTools Protocol to wait for an explicit page result before shutting down the browser or removing its profile.

**Why:** Property data and image writes complete through IndexedDB events, which are not reliably covered by a DOM snapshot timing shortcut.

**How to apply:** For browser tests that use the app's browser storage, launch Chromium with a temporary profile, poll a page status through DevTools, and wait for the browser process to close before deleting that profile.