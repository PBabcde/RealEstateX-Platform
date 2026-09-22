from fastapi import APIRouter

from apps.realestateX_app.backend.services.dealfinance_service import simulate

router = APIRouter(prefix="/dealFinanceX", tags=["DealFinanceX"])


@router.post("/simulate")
def deal_finance(purchase: float, own_money: float, loan: float, interest: float, annual_cashflow: float) -> dict:
    return simulate(purchase, own_money, loan, interest, annual_cashflow)