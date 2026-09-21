from modules.realestateX.mortgageX import MortgageX


def test_zero_interest_mortgage_is_linear() -> None:
    result = MortgageX().calculate(120000, 0, 10)
    assert result["monthly_payment"] == 1000
    assert result["total_repayment"] == 120000
