from typing import Any, Dict, List

from fastapi import APIRouter

from apps.realestateX_app.backend.services.tenant_service import overview

router = APIRouter(prefix="/tenantX", tags=["TenantX"])


@router.post("/overview")
def tenant_overview(tenants: List[Dict[str, Any]] | None = None) -> dict:
    return overview(tenants)