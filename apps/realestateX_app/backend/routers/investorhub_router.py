from typing import Any, Dict, List

from fastapi import APIRouter

from apps.realestateX_app.backend.services.investorhub_service import match

router = APIRouter(prefix="/investorHubX", tags=["InvestorHubX"])


@router.post("/match")
def investor_match(investors: List[Dict[str, Any]], deal: Dict[str, Any]) -> dict:
    return match(investors, deal)