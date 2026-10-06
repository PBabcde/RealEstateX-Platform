---
name: RealEstateX authenticated UI tests
description: Distinguish local photo/storage UI tests from real authenticated RealEstateX end-to-end tests.
---

Storage-only IndexedDB tests and test-only signed-in fixtures do not verify real server authorization or the identity-to-local-user bridge.

For isolated photo/storage UI tests, a test-only signed-in fixture is acceptable. For actual authentication acceptance tests, establish a real Clerk session programmatically and verify successful user-scoped API requests and data-dependent page content.

**Why:** A page may mount behind a fixture while the real server rejects the session or resolves the wrong user. Fresh headless browsers are signed out, and production auth bypasses would weaken the real gate.

**How to apply:** Keep fixtures limited to the isolated storage test configuration. Real auth tests must use cookies and assert server-returned user-scoped data, not merely that the shell appeared.