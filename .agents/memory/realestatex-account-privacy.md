---
name: RealEstateX account privacy and EnergyX contract
description: Durable product rules for legacy browser-only projects and the deferred cross-app integration.
---

- Accountless IndexedDB projects remain hidden until a signed-in account explicitly claims them; after the claim, only that account can access them.
- Keep EnergyX data exchange deferred until its official API contract or OpenAPI specification is available; prioritize active tasks and deployment first.

**Why:** The user explicitly chose claim-only access for legacy data to prevent cross-account exposure, asked to wait for a real API contract rather than guessing request and response behavior, and directed that active tasks and deployment come first.

**How to apply:** Keep unclaimed records inaccessible to account-scoped stores. Do not work on EnergyX before its official contract is supplied and active tasks and deployment are prioritized; then scope the bridge to the authenticated tenant/account and validate the exchange before using its results in WWS calculations.
