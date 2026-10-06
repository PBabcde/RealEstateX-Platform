---
name: Vite React cache after catalog upgrades
description: Stale optimized dependencies can produce a React version mismatch despite matching installed versions.
---

A workspace React catalog upgrade can leave Vite's optimized react-dom bundle on the old version, even after dependency installation and a workflow restart.

**Why:** During a Clerk migration, installed React and react-dom matched, but the preview still loaded an older optimized react-dom bundle and crashed with a version mismatch.

**How to apply:** If installed versions match but the browser reports a mismatch after an upgrade, inspect the affected artifact's Vite dependency cache. Clear the stale optimized cache and restart that artifact; do not repeatedly change compatible package versions.
