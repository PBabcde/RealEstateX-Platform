---
name: RealEstateX cross-tab testing
description: Verify browser storage synchronization using genuinely separate tabs.
---

Cross-tab freshness tests must run the UI consumer and the storage mutation in separate browser contexts; mounting two components in one page does not simulate two tabs.

**Why:** BroadcastChannel does not deliver a tab's message back to that same tab, so a same-context mutation can miss the cross-tab notification path and give a misleading result.

**How to apply:** Keep one saved-project list open in each tab, mutate storage from one tab, and assert the other tab updates without reloading or reopening its list.

When a browser test connects directly to DevTools after spawning Chromium, wait for the debugging endpoint to become available before requesting browser-level metadata.

**Why:** Process creation returns before Chromium has opened its debugging port, so an immediate fetch can fail even when the browser starts normally.

**How to apply:** Reuse the browser-target polling helper before making direct requests to the DevTools browser endpoint.

When testing account-private data in separate tabs, configure each tab's mocked account identity before mounting the app; changing identity afterward can let startup read the default account first.

**Why:** The app selects its IndexedDB scope when its account-scoped page mounts, so a late identity change can hide a transient cross-account read.

**How to apply:** Set each tab's test identity before importing or rendering the app, then verify its project list, image previews, and storage notifications.
