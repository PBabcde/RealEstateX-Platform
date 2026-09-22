from typing import Any, Dict, List

from modules.phase2_base import module_result


class PortfolioX:
    def overview(self, properties: List[Dict[str, Any]]) -> dict:
        return module_result("PortfolioX", {
            "propertyCount": len(properties),
            "totalArea": sum(float(item.get("woonoppervlak", 0)) for item in properties),
            "cashflow": sum(float(item.get("cashflow", 0)) for item in properties),
            "valueGrowth": sum(float(item.get("valueGrowth", 0)) for item in properties),
            "return": round(sum(float(item.get("return", 0)) for item in properties) / len(properties), 2) if properties else 0,
        })