from typing import Any, Dict, List

from modules.investorHubX.investorHubX import InvestorHubX

service = InvestorHubX()


def match(investors: List[Dict[str, Any]], deal: Dict[str, Any]) -> dict:
    return service.match(investors, deal)
