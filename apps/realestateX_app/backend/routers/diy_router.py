from fastapi import APIRouter

from apps.realestateX_app.backend.services.diy_service import plan

router = APIRouter(prefix="/diyX", tags=["DIYX"])


@router.post("/plan")
def diy_plan(project_type: str, budget: float = 0) -> dict:
    return plan(project_type, budget)