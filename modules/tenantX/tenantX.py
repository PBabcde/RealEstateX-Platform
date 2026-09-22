from typing import Any, Dict, List

from modules.phase2_base import module_result


class TenantX:
    def overview(self, tenants: List[Dict[str, Any]] | None = None) -> dict:
        records = tenants or []
        return module_result("TenantX", {
            "tenantCount": len(records),
            "paid": sum(1 for tenant in records if tenant.get("paymentStatus") == "paid"),
            "openPayments": sum(1 for tenant in records if tenant.get("paymentStatus") == "open"),
            "contracts": sum(1 for tenant in records if tenant.get("contractStatus") == "active"),
            "maintenanceOpen": sum(1 for tenant in records if tenant.get("maintenanceStatus") == "open"),
        })