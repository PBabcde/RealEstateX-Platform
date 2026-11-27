---
name: tsx test module mode
description: Module-loading constraints for root-level JavaScript integration tests in this workspace.
---

Root-level JavaScript tests run through `tsx` may be transformed as CommonJS, so top-level `await` can fail even when the test uses ESM-style imports. Dynamic ESM imports from those files may also resolve workspace package aliases differently from code inside a workspace package.

**Why:** A failed route test can look like a test or database issue when the actual problem is the loader's module mode or package resolution context.

**How to apply:** Keep setup compatible with the test loader, perform asynchronous imports inside the test callback, and resolve workspace packages from an established workspace context when aliases are unavailable.

Route-level API integration tests that import the full Express app can also fail before reaching their target because the app imports the OpenAPI YAML file as a module under `tsx`.

**Why:** This loader failure prevented the Sales & CRM integration assertions from running even though the routes themselves were healthy.

**How to apply:** When testing a route independently, mount the exported router in a minimal Express test app with only the required middleware instead of importing the full application entry point.