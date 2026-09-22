from typing import Dict

from modules.dealScoreX.dealScoreX import DealScoreX

service = DealScoreX()


def score(factors: Dict[str, float]) -> dict:
    return service.score(factors)
