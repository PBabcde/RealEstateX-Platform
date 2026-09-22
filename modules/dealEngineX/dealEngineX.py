from typing import Dict

from modules.dealScoreX.dealScoreX import DealScoreX
from modules.phase2_base import module_result


class DealEngineX:
    def __init__(self) -> None:
        self.scorer = DealScoreX()

    def analyze(self, operation: str, factors: Dict[str, float]) -> dict:
        score = self.scorer.score(factors)
        decision = "go" if score["dealScore"] >= 70 else "hold" if score["dealScore"] >= 50 else "reject"
        return module_result("DealEngineX", {"operation": operation, "decision": decision, "score": score})