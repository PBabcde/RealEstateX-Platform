from typing import List

from modules.subsidiesX.subsidiesX import SubsidiesX

service = SubsidiesX()


def scan(region: str = "NL", measures: List[str] | None = None) -> dict:
    return service.scan(region, measures)
