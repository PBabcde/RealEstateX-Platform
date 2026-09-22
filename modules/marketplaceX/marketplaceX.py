from typing import Any, Dict, List

from modules.phase2_base import module_result


class MarketplaceX:
    def top(self, listings: List[Dict[str, Any]] | None = None) -> dict:
        records = listings or [
            {"id": "listing-001", "title": "Stadswoning met verhuurpotentieel", "views": 184, "interest": 92, "status": "nieuw aanbod"},
            {"id": "listing-002", "title": "Transformatieobject nabij station", "views": 151, "interest": 86, "status": "investeerders aanbod"},
        ]
        return module_result("MarketplaceX", {
            "mostViewed": sorted(records, key=lambda item: item.get("views", 0), reverse=True)[:10],
            "mostInteresting": sorted(records, key=lambda item: item.get("interest", 0), reverse=True)[:10],
            "newSupply": [item for item in records if item.get("status") == "nieuw aanbod"],
            "investorSupply": [item for item in records if item.get("status") == "investeerders aanbod"],
        })