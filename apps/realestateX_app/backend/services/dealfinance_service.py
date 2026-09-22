from modules.dealFinanceX.dealFinanceX import DealFinanceX

service = DealFinanceX()


def simulate(purchase: float, own_money: float, loan: float, interest: float, annual_cashflow: float) -> dict:
    return service.simulate(purchase, own_money, loan, interest, annual_cashflow)
