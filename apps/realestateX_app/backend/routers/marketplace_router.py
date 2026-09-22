from typing import Any, Dict, List

from fastapi import APIRouter

from apps.realestateX_app.backend.services.marketplace_service import top

router = APIRouter(prefix="/marketplaceX", tags=["MarketplaceX"])


@router.post("/top")
def marketplace_top(listings: List[Dict[str, Any]] | None = None) -> dict:
    return top(listings)