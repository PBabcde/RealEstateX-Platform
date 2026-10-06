---
name: RealEstateX account privacy and EnergyX contract
description: Durable product rules for legacy browser-only projects and the deferred cross-app integration.
---

- Accountless IndexedDB projects remain hidden until a signed-in account explicitly claims them; after the claim, only that account can access them.
- Do not implement or simulate EnergyX data exchange until its official API contract or OpenAPI specification is available.

**Why:** The user explicitly chose claim-only access for legacy data to prevent cross-account exposure and asked to wait for a real API contract rather than guessing request and response behavior.

**How to apply:** Keep unclaimed records inaccessible to account-scoped stores. When the EnergyX contract is supplied, scope the bridge to the authenticated tenant/account and validate the exchange before using its results in WWS calculations.
