from typing import Any, Dict, List

from fastapi import APIRouter

from apps.realestateX_app.backend.services.community_service import overview

router = APIRouter(prefix="/communityX", tags=["CommunityX"])


@router.post("/overview")
def community_overview(groups: List[Dict[str, Any]] | None = None) -> dict:
    return overview(groups)