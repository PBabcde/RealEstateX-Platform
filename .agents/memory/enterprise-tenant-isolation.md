---
name: Enterprise tenant isolation
description: Boundary decisions for tenant-scoped Enterprise Core records.
---

Audit sequence numbers, audit hash chains, trust metadata identity, recovery
points, and integrity checks are tenant-scoped. The runtime recovery mode is
intentionally global because it protects the running process rather than
representing tenant data.

**Why:** A global audit sequence or trust primary key would couple tenants and
make a tenant-filtered read either incomplete or vulnerable to cross-tenant
collisions. A tenant-specific recovery mode would instead allow writes in one
tenant while another tenant is in READ_ONLY.

**How to apply:** Require the authenticated tenant ID in every Enterprise Core
read and write, include it in audit-chain locking/ordering and conflict keys,
and keep process-wide recovery guards separate from tenant-owned records.