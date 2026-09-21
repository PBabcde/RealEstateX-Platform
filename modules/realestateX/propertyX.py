from typing import Any, Dict

from core.validation import validate_property


class PropertyX:
    """Vastgoedobjecten en portfolio-acties."""

    def add_property(self, property_id: str, data: Dict[str, Any]) -> dict:
        validate_property(data)
        return {
            "status": "ok",
            "operation": "add_property",
            "property_id": property_id,
            "data": data,
        }
