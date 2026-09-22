from typing import Any, Dict, List

from modules.phase2_base import module_result


class FinanceHubX:
    def overview(self, deals: List[Dict[str, Any]] | None = None) -> dict:
        records = deals or []
        return module_result("FinanceHubX", {
            "dealFinancing": len(records),
            "mortgages": sum(1 for deal in records if deal.get("type") == "hypotheek"),
            "investorLoans": sum(1 for deal in records if deal.get("type") == "investeerder"),
            "bankLoans": sum(1 for deal in records if deal.get("type") == "bank"),
        })