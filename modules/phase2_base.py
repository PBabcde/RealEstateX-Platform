import json
import os
from datetime import datetime, timezone
from typing import Any, Dict


PHASE2_PATH = os.path.join("storage", "realestateX")


def load_module(name: str, fallback: Any) -> Any:
    os.makedirs(PHASE2_PATH, exist_ok=True)
    path = os.path.join(PHASE2_PATH, f"{name}.json")
    if not os.path.exists(path):
        save_module(name, fallback)
        return fallback
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        save_module(name, fallback)
        return fallback


def save_module(name: str, data: Any) -> None:
    os.makedirs(PHASE2_PATH, exist_ok=True)
    path = os.path.join(PHASE2_PATH, f"{name}.json")
    temporary = f"{path}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
    os.replace(temporary, path)


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def clamp(value: float, minimum: float = 0, maximum: float = 100) -> float:
    return round(max(minimum, min(maximum, value)), 2)


def module_result(module: str, data: Dict[str, Any]) -> Dict[str, Any]:
    return {"status": "ok", "module": module, "updatedAt": timestamp(), **data}