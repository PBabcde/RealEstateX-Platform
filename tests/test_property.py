from modules.realestateX.propertyX import PropertyX


def test_add_property_returns_operation() -> None:
    result = PropertyX().add_property(
        "test-001",
        {
            "adres": "Teststraat 1",
            "type": "Appartement",
            "bouwjaar": 2020,
            "woonoppervlak": 60,
            "perceel": 0,
            "energielabel": "A",
        },
    )
    assert result["status"] == "ok"
    assert result["property_id"] == "test-001"
