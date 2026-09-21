from fastapi import APIRouter

from apps.realestateX_app.backend.services.market_service import trends

router = APIRouter(prefix="/marketX", tags=["MarketX"])


@router.get("/trends")
def market_trends() -> dict:
    return trends()
