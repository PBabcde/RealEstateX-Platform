---
name: Module and RAG tenant storage
description: Tenant boundary decisions for module_data and the local RAG index fallback.
---

The default tenant keeps the existing ownerworld JSON filenames for compatibility. Non-default tenants must use tenant-derived filenames in the local fallback, while PostgreSQL uses tenant_id in the module_data key.

RAG indexes store their tenant ID in the index payload as well as in the enclosing module_data row. Legacy ownerworld RAG payloads are normalized during migration/import.

**Why:** Existing ownerworld files are the migration source and cannot be renamed without breaking compatibility, but sharing them with other tenants would recreate the original cross-tenant read/write gap.

**How to apply:** Keep every module-data and RAG read/write/delete API explicit about tenant ID; when adding importers or fallback formats, preserve the default files only for the default tenant and never import tenant-derived cache files as ownerworld source data.