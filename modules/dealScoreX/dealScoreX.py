from typing import Dict

from modules.phase2_base import clamp, module_result


class DealScoreX:
    WEIGHTS = {"locatie": .22, "prijs": .22, "risico": .20, "rendement": .20, "markttrend": .10, "energielabel": .06}

    def score(self, factors: Dict[str, float]) -> dict:
        normalized = {key: clamp(float(factors.get(key, 50))) for key in self.WEIGHTS}
        deal_score = clamp(sum(normalized[key] * weight for key, weight in self.WEIGHTS.items()))
        risk_score = clamp(100 - normalized["risico"])
        chance_score = clamp((deal_score * .7) + (normalized["markttrend"] * .3))
        return module_result("DealScoreX", {
            "dealScore": deal_score, "chanceScore": chance_score, "riskScore": risk_score, "factors": normalized,
        })