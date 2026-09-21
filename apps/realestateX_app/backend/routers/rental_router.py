from typing import Any, Dict

from fastapi import APIRouter

from apps.realestateX_app.backend.services.rental_service import rental_overview

router = APIRouter(prefix="/rentalX", tags=["RentalX"])


@router.post("/overview")
def overview(data: Dict[str, Any]) -> dict:
    return rental_overview(data)
