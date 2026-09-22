from fastapi import APIRouter

from apps.realestateX_app.backend.services.dealstruct_service import advise

router = APIRouter(prefix="/dealStructX", tags=["DealStructX"])


@router.post("/advise")
def deal_structure(scenario: str) -> dict:
    return advise(scenario)