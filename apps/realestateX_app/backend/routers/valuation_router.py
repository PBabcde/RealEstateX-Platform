from typing import Any, Dict

from fastapi import APIRouter

from apps.realestateX_app.backend.services.valuation_service import calculate_valuation

router = APIRouter(prefix="/valuationX", tags=["ValuationX"])


@router.post("/calculate")
def calculate(data: Dict[str, Any]) -> dict:
    return calculate_valuation(data)
