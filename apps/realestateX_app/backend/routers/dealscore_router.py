from typing import Dict

from fastapi import APIRouter

from apps.realestateX_app.backend.services.dealscore_service import score

router = APIRouter(prefix="/dealScoreX", tags=["DealScoreX"])


@router.post("/score")
def deal_score(factors: Dict[str, float]) -> dict:
    return score(factors)