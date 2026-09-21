from modules.realestateX.marketX import MarketX


def test_market_trends_returns_current_summary() -> None:
    result = MarketX().trends()
    assert result["status"] == "ok"
    assert result["change"] > 0
    assert result["period"]