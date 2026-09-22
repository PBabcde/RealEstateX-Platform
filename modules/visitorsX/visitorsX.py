from typing import Any, Dict, List

from modules.phase2_base import module_result


class VisitorsX:
    def summary(self, visits: List[Dict[str, Any]] | None = None) -> dict:
        records = visits or []
        sources: Dict[str, int] = {}
        for visit in records:
            source = str(visit.get("source", "direct"))
            sources[source] = sources.get(source, 0) + 1
        return module_result("VisitorsX", {"visits": len(records), "sessions": len({item.get("sessionId") for item in records}), "sources": sources, "behaviourEvents": len(records)})