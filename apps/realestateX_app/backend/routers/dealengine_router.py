from typing import Dict

from fastapi import APIRouter

from apps.realestateX_app.backend.services.dealengine_service import analyze

router = APIRouter(prefix="/dealEngineX", tags=["DealEngineX"])


@router.post("/analyze")
def deal_analyze(operation: str, factors: Dict[str, float]) -> dict:
    return analyze(operation, factors)