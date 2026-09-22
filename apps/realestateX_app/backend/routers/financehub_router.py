from typing import Any, Dict, List

from fastapi import APIRouter

from apps.realestateX_app.backend.services.financehub_service import overview

router = APIRouter(prefix="/financeHubX", tags=["FinanceHubX"])


@router.post("/overview")
def finance_overview(deals: List[Dict[str, Any]] | None = None) -> dict:
    return overview(deals)