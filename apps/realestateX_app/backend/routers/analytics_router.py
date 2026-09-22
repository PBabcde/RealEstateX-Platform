from fastapi import APIRouter

from apps.realestateX_app.backend.services.analytics_service import dashboard

router = APIRouter(prefix="/analyticsX", tags=["AnalyticsX"])


@router.get("/dashboard")
def analytics_dashboard(visitors: int = 0, deals: int = 0, leads: int = 0, market_points: int = 0) -> dict:
    return dashboard(visitors, deals, leads, market_points)