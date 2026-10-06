---
name: Browser IndexedDB testing
description: Running reliable browser-level tests against asynchronous IndexedDB storage in this workspace.
---

Headless Chromium's `--dump-dom` can capture the page before asynchronous IndexedDB work finishes, even with a virtual-time budget. Use the DevTools Protocol to wait for an explicit page result before shutting down the browser or removing its profile.

Cold Chromium startup here can take nearly 30 seconds before DevTools is available, and it can occasionally stay CPU-bound without exposing DevTools for over 60 seconds. Treat failures before a page opens separately from page-level test failures. Temporary profile files can linger briefly after the browser closes; use retrying recursive cleanup.

**Why:** Property data and image writes complete through IndexedDB events, and the current Replit runtime adds variable Chromium startup and profile-cleanup delays.

**How to apply:** For browser tests that use the app's browser storage, allow ample time to discover DevTools and poll an explicit page status. If the browser never exposes DevTools, capture its process output and report it as an environment startup failure rather than an app assertion; after the browser does start, wait for it to close and retry temporary-profile cleanup.