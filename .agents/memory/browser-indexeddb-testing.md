---
name: Browser IndexedDB testing
description: Running reliable browser-level tests against asynchronous IndexedDB storage in this workspace.
---

Headless Chromium's `--dump-dom` can capture the page before asynchronous IndexedDB work finishes, even with a virtual-time budget. Use the DevTools Protocol to wait for an explicit page result before shutting down the browser or removing its profile.

Cold Chromium startup in this environment can take nearly 30 seconds before DevTools is available, so a 30-second discovery deadline is fragile. Temporary profile files can also linger briefly after the browser closes; use retrying recursive cleanup.

**Why:** Property data and image writes complete through IndexedDB events, and the current Replit runtime adds variable Chromium startup and profile-cleanup delays.

**How to apply:** For browser tests that use the app's browser storage, allow at least 60 seconds to discover DevTools, poll a page status, then wait for the browser process to close and retry temporary-profile cleanup.