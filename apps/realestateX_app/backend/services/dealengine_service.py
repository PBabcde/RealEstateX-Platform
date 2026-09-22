from typing import Dict

from modules.dealEngineX.dealEngineX import DealEngineX

service = DealEngineX()


def analyze(operation: str, factors: Dict[str, float]) -> dict:
    return service.analyze(operation, factors)
