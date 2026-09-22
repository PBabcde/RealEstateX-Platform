from typing import Any, Dict, List

from modules.tenantX.tenantX import TenantX

service = TenantX()


def overview(tenants: List[Dict[str, Any]] | None = None) -> dict:
    return service.overview(tenants)
