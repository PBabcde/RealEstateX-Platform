from typing import Any, Dict, List

from modules.phase2_base import module_result


class InvestorHubX:
    def match(self, investors: List[Dict[str, Any]], deal: Dict[str, Any]) -> dict:
        target = set(deal.get("interestAreas", []))
        ranked = []
        for investor in investors:
            overlap = len(target.intersection(investor.get("interestAreas", [])))
            return_score = abs(float(investor.get("preferredReturn", 0)) - float(deal.get("expectedReturn", 0)))
            ranked.append({**investor, "matchScore": round(overlap * 50 + max(0, 50 - return_score), 2)})
        ranked.sort(key=lambda item: item["matchScore"], reverse=True)
        return module_result("InvestorHubX", {"matches": ranked})