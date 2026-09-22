from typing import List

from fastapi import APIRouter

from apps.realestateX_app.backend.services.subsidies_service import scan

router = APIRouter(prefix="/subsidiesX", tags=["SubsidiesX"])


@router.post("/scan")
def subsidy_scan(region: str = "NL", measures: List[str] | None = None) -> dict:
    return scan(region, measures)