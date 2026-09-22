from typing import Any, Dict, List

from modules.marketplaceX.marketplaceX import MarketplaceX

service = MarketplaceX()


def top(listings: List[Dict[str, Any]] | None = None) -> dict:
    return service.top(listings)
