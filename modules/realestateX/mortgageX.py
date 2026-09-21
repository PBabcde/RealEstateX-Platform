from typing import Dict

from core.validation import require_number


class MortgageX:
    """Annuïtaire hypotheekberekening."""

    def calculate(self, principal: float, interest: float, years: int) -> dict:
        if principal < 0 or interest < 0 or years < 1:
            raise ValueError("principal, interest and years must be valid")
        annual_rate = interest / 100 if interest > 1 else interest
        months = years * 12
        monthly_rate = annual_rate / 12
        payment = (
            principal / months
            if monthly_rate == 0
            else (principal * monthly_rate)
            / (1 - (1 + monthly_rate) ** -months)
        )
        return {
            "status": "ok",
            "monthly_payment": round(payment, 2),
            "total_repayment": round(payment * months, 2),
        }
