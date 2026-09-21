---
name: TypeScript DOM iterable compatibility
description: Workspace client code using Headers.entries needs the DOM iterable library enabled.
---

The shared generated API client requires `dom.iterable` in its TypeScript `lib` list for `Headers.entries()` to typecheck.

**Why:** The generated fetch helper enumerates response headers, and the base client tsconfig otherwise reports missing `Headers.entries()` even though the runtime supports it.

**How to apply:** If generated client typechecking fails on `Headers.entries`, check the importing package's tsconfig includes both `dom` and `dom.iterable`.