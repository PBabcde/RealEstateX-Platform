from typing import Any, Dict

from core.validation import require_number


class RentalX:
    """Huurprijs, kosten en rendement."""

    def rental_overview(self, data: Dict[str, Any]) -> dict:
        price = require_number(data, "huurprijs")
        costs = require_number(data, "kosten")
        investment = float(data.get("investering", 0))
        annual_rendement = round(price * 12 - costs, 2)
        gross_yield = round((price * 12 / investment) * 100, 2) if investment else 0
        return {
            "status": "ok",
            "annual_rendement": annual_rendement,
            "gross_yield": gross_yield,
        }
