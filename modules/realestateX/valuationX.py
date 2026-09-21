from typing import Any, Dict

from core.validation import require_number


class ValuationX:
    """Woningwaardering op basis van oppervlakte, label en locatie."""

    def calculate(self, property_data: Dict[str, Any]) -> dict:
        area = require_number(property_data, "woonoppervlak", minimum=1)
        location_factor = float(property_data.get("locatieFactor", 1))
        label_bonus = 15000 if property_data.get("energielabel") in ("A", "B") else 0
        valuation = round(area * 3000 * location_factor + label_bonus, 2)
        return {
            "status": "ok",
            "valuation": valuation,
            "price_per_square_meter": round(valuation / area, 2),
        }
