from typing import Dict

from modules.phase2_base import module_result


class DealFinanceX:
    def simulate(self, purchase: float, own_money: float, loan: float, interest: float, annual_cashflow: float) -> dict:
        annual_interest = loan * (interest / 100 if interest > 1 else interest)
        net_cashflow = annual_cashflow - annual_interest
        total_invested = own_money or max(purchase - loan, 1)
        roi = (net_cashflow / total_invested) * 100
        irr = ((max(net_cashflow, 0) + total_invested) / total_invested) ** (1 / 10) - 1
        return module_result("DealFinanceX", {
            "purchase": purchase, "ownMoney": own_money, "loan": loan, "annualInterest": round(annual_interest, 2),
            "cashflow": round(net_cashflow, 2), "roi": round(roi, 2), "irr": round(irr * 100, 2),
        })