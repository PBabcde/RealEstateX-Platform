from modules.realestateX.valuationX import ValuationX


def test_green_label_adds_bonus() -> None:
    result = ValuationX().calculate({"woonoppervlak": 100, "energielabel": "A"})
    assert result["valuation"] == 315000
    assert result["price_per_square_meter"] == 3150
