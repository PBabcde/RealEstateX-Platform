from typing import Any, Dict, List

from modules.visitorsX.visitorsX import VisitorsX

service = VisitorsX()


def summary(visits: List[Dict[str, Any]] | None = None) -> dict:
    return service.summary(visits)
