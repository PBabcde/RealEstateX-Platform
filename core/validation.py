from typing import Any, Mapping


def require_number(data: Mapping[str, Any], key: str, minimum: float = 0) -> float:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{key} must be a number")
    if value < minimum:
        raise ValueError(f"{key} must be at least {minimum}")
    return float(value)


def validate_property(data: Mapping[str, Any]) -> None:
    for field in ("adres", "type", "energielabel"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            raise ValueError(f"{field} is required")

    bouwjaar = data.get("bouwjaar")
    if not isinstance(bouwjaar, int) or not 1000 <= bouwjaar <= 2100:
        raise ValueError("bouwjaar must be between 1000 and 2100")

    require_number(data, "woonoppervlak", minimum=1)
    require_number(data, "perceel", minimum=0)