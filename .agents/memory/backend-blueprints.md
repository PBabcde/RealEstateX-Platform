---
name: Backend blueprint interpretation
description: User-approved treatment of external Python blueprints and simplified energy estimates.
---

Retain and extend RealEstateX's existing backend when implementing the Property Dossier and Energy Brain blueprint; do not introduce a separate Python backend just because the supplied document assumes FastAPI.

**Why:** The user explicitly chose to retain the existing backend after the mismatch between the document and the application was explained.

**How to apply:** Translate the requested capabilities into the existing architecture while preserving existing dossiers and integrations.

Keep the simplified label-based Energy Brain estimate separate from the existing investment-policy assessment.

**Why:** The supplied baseline assumes a fixed annual saving of 18% of investment; it is not an engineering model or evidence that a deal satisfies the previously agreed investment criteria.

**How to apply:** Describe its results as indicative. Do not use that simplified estimate to bypass the existing financial, regional or installation requirements.
