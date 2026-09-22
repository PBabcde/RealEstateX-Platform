from typing import Any, Dict, List

from modules.financeHubX.financeHubX import FinanceHubX

service = FinanceHubX()


def overview(deals: List[Dict[str, Any]] | None = None) -> dict:
    return service.overview(deals)
