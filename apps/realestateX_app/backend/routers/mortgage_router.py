from fastapi import APIRouter

from apps.realestateX_app.backend.services.mortgage_service import calculate_mortgage

router = APIRouter(prefix="/mortgageX", tags=["MortgageX"])


@router.post("/calculate")
def calculate(principal: float, interest: float, years: int) -> dict:
    return calculate_mortgage(principal, interest, years)
