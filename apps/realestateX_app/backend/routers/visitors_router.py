from typing import Any, Dict, List

from fastapi import APIRouter

from apps.realestateX_app.backend.services.visitors_service import summary

router = APIRouter(prefix="/visitorsX", tags=["VisitorsX"])


@router.post("/summary")
def visitors_summary(visits: List[Dict[str, Any]] | None = None) -> dict:
    return summary(visits)