from typing import Dict

from modules.phase2_base import clamp, module_result


class RiskX:
    def assess(self, market: float = 40, interest: float = 40, vacancy: float = 40, transformation: float = 40) -> dict:
        factors = {"marketRisk": clamp(market), "interestRisk": clamp(interest), "vacancyRisk": clamp(vacancy), "transformationRisk": clamp(transformation)}
        overall = round(sum(factors.values()) / len(factors), 2)
        return module_result("RiskX", {"overallRisk": overall, "level": "hoog" if overall >= 70 else "middel" if overall >= 40 else "laag", "factors": factors})