from modules.realestateX.rentalX import RentalX


def test_rental_overview_calculates_annual_return() -> None:
    result = RentalX().rental_overview(
        {"huurprijs": 2000, "kosten": 3600, "investering": 500000}
    )
    assert result["annual_rendement"] == 20400
    assert result["gross_yield"] == 4.8
