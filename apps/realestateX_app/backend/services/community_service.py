from typing import Any, Dict, List

from modules.communityX.communityX import CommunityX

service = CommunityX()


def overview(groups: List[Dict[str, Any]] | None = None) -> dict:
    return service.overview(groups)
