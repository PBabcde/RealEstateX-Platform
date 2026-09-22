from fastapi import APIRouter

from apps.realestateX_app.backend.services.core_service import health

router = APIRouter(prefix="/coreX", tags=["CoreX"])


@router.get("/health")
def system_health() -> dict:
    return health()