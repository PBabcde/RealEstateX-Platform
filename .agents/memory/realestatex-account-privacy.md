---
name: RealEstateX account privacy and EnergyX contract
description: Durable product rules for legacy browser-only projects and EnergyX preparation before a live API contract.
---

- Accountless IndexedDB projects remain hidden until a signed-in account explicitly claims them; after the claim, only that account can access them.
- The user now explicitly authorizes building EnergyX endpoints and B2B/B2C functionality before the official API contract is available. Prepare the functionality locally, but keep real external data exchange deferred until the official contract is supplied.
- Local EnergyX estimates must not be presented as live reports, official WWS calculations, or requests actually sent to installers. WWS-puntenwinst may be a manual indication; do not invent an official automatic score.

**Why:** The user chose claim-only access to prevent cross-account exposure. They later explicitly changed the earlier wait-first instruction to “Bouw de endpoints en B2B/B2C functionaliteit direct op” and asked to prepare the interface for live reports. The official EnergyX contract and validated WWS rules are still absent.

**How to apply:** Keep unclaimed records inaccessible to account-scoped stores. Build EnergyX preparation now with explicit estimate/internal-registration labels; scope data to the authenticated account and validate the eventual live exchange before using its results in WWS calculations.
