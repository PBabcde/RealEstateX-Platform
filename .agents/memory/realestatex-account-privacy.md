---
name: RealEstateX account privacy and EnergyX separation
description: Claim-only legacy data, authorized local EnergyX preparation, and separate-app sharing boundaries.
---

- Accountless IndexedDB projects remain hidden until a signed-in account explicitly claims them; after the claim, only that account can access them.
- The user explicitly authorizes local EnergyX endpoints and B2B/B2C preparation. That preparation does not authorize cross-app property sharing.
- EnergyX Suite and RealEstateX are separately deployed applications on the user's Coolify infrastructure, with separate codebases and databases. Do not assume an external EnergyX API or invent a data-transfer contract.
- The user chose no RealEstateX-to-EnergyX transfer for now.
- Local EnergyX estimates must not be presented as live reports, official WWS calculations, or requests actually sent to installers. WWS-puntenwinst may be a manual indication; do not invent an official automatic score.

**Why:** The user chose claim-only access to prevent cross-account exposure and authorized local EnergyX preparation with “Bouw de endpoints en B2B/B2C functionaliteit direct op.” They subsequently clarified the independent Coolify deployments, rejected the assumption that an external API contract is needed, and explicitly selected no cross-app transfer yet. Validated WWS rules are still absent.

**How to apply:** Keep unclaimed records inaccessible to account-scoped stores. Local EnergyX preparation must use explicit estimate/internal-registration labels and authenticated account/tenant boundaries. Do not imply that independent app databases share data. Before any later cross-app property sharing, establish the actual transfer path and exact data scope with the user rather than guessing external API fields; independently validate any eventual use of results in WWS calculations.

## Public previews and installation administration

Public calculator/Innovation Center access does not authorize exposing existing property, deal or photo records. Installation-key administration is restricted to the standard public tenant and the Control Room/Sales/CRM surfaces, not a global bypass of ownership checks.

**Why:** The owner requested a public first circle and a separate admin-key route for Control Room and Sales Engine, while requiring reuse of existing data models and preserving private account functionality.

**How to apply:** Never infer a private tenant from an untrusted public request or expand the installation key to property APIs. Reuse manual/illustrative previews rather than present private deals or unvalidated WWS calculations as public/live data.
