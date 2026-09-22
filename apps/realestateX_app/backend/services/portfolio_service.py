from typing import Any, Dict, List

from modules.portfolioX.portfolioX import PortfolioX

service = PortfolioX()


def overview(properties: List[Dict[str, Any]]) -> dict:
    return service.overview(properties)
