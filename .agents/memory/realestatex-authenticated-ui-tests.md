---
name: RealEstateX authenticated UI tests
description: Browser-test constraints for RealEstateX routes protected by Replit Auth.
---

The app checks authentication before rendering its route tree. The browser-based IndexedDB test page bypasses that app shell, so navigating a fresh Chromium profile to the studio only shows the sign-in screen unless the test establishes an authenticated session.

**Why:** A fresh headless browser profile has no signed-in session; a storage test cannot validate the visible recovery panel or upload interaction by itself.

**How to apply:** Use a supported authenticated test fixture or mount the page with an auth test provider for UI-level tests. Keep storage-layer tests explicitly scoped to IndexedDB, and do not weaken the app's auth gate to make tests pass.