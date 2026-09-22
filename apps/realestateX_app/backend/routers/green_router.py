from fastapi import APIRouter

from apps.realestateX_app.backend.services.green_service import assess

router = APIRouter(prefix="/greenX", tags=["GreenX"])


@router.get("/assess")
def green_assess(energielabel: str = "C", area: float = 0) -> dict:
    return assess(energielabel, area)