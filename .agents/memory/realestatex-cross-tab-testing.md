---
name: RealEstateX cross-tab testing
description: Verify browser storage synchronization using genuinely separate tabs.
---

Cross-tab freshness tests must run the UI consumer and the storage mutation in separate browser contexts; mounting two components in one page does not simulate two tabs.

**Why:** BroadcastChannel does not deliver a tab's message back to that same tab, so a same-context mutation can miss the cross-tab notification path and give a misleading result.

**How to apply:** Keep one saved-project list open in each tab, mutate storage from one tab, and assert the other tab updates without reloading or reopening its list.
