---
name: RealEstateX authenticated UI tests
description: Browser-test constraints for RealEstateX routes protected by Replit Auth.
---

The app checks authentication before rendering its route tree. The browser-based IndexedDB test page bypasses that app shell, so navigating a fresh Chromium profile to the studio only shows the sign-in screen unless the test establishes an authenticated session.

For browser tests of protected UI, use a test-only Vite config that aliases the auth hook to a fixed signed-in fixture. Load the real app entry and route so the app's auth gate and shell still run; leave production auth wiring unchanged.

**Why:** A fresh headless browser profile has no signed-in session; storage-only tests cannot validate protected UI, while a production auth bypass would weaken the real gate.

**How to apply:** Use the test-only auth alias for UI-level browser tests and assert the authenticated shell appears. Keep storage-layer checks scoped to IndexedDB and do not add test bypasses to production app code.