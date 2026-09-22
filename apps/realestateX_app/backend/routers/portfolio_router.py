from typing import Any, Dict, List

from fastapi import APIRouter

from apps.realestateX_app.backend.services.portfolio_service import overview

router = APIRouter(prefix="/portfolioX", tags=["PortfolioX"])


@router.post("/overview")
def portfolio_overview(properties: List[Dict[str, Any]]) -> dict:
    return overview(properties)