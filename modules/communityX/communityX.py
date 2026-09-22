from typing import Any, Dict, List

from modules.phase2_base import module_result


class CommunityX:
    def overview(self, groups: List[Dict[str, Any]] | None = None) -> dict:
        records = groups or [
            {"name": "Vastgoed in Utrecht", "members": 128, "discussions": 24},
            {"name": "Verduurzamen samen", "members": 86, "discussions": 17},
        ]
        return module_result("CommunityX", {"groups": records, "totalMembers": sum(item.get("members", 0) for item in records), "totalDiscussions": sum(item.get("discussions", 0) for item in records)})