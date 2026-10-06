---
name: Post-merge setup timing
description: The post-merge routine needs enough time for dependency installation and an optional database schema push.
---

The configured post-merge routine completed in about 21 seconds even with an up-to-date lockfile because the database schema push follows dependency installation. A 20-second deadline is therefore too short in this workspace; a 120-second deadline completed successfully.

**Why:** The initial automatic setup timed out before reaching completion, while rerunning with more headroom applied the schema successfully.

**How to apply:** Recheck the current post-merge script and use a timeout with buffer for all of its steps, not just package installation.
