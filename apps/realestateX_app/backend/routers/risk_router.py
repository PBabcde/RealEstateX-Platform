from fastapi import APIRouter

from apps.realestateX_app.backend.services.risk_service import assess

router = APIRouter(prefix="/riskX", tags=["RiskX"])


@router.get("/assess")
def risk_assess(market: float = 40, interest: float = 40, vacancy: float = 40, transformation: float = 40) -> dict:
    return assess(market, interest, vacancy, transformation)