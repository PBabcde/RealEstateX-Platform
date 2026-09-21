import json
import os
from typing import Any, Dict


class RealEstateStorageX:
    BASE_PATH = "storage/realestateX"

    def __init__(self) -> None:
        os.makedirs(self.BASE_PATH, exist_ok=True)

    def _save(self, filename: str, data: Dict[str, Any]) -> None:
        temporary = os.path.join(self.BASE_PATH, f"{filename}.tmp")
        final = os.path.join(self.BASE_PATH, filename)
        with open(temporary, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, ensure_ascii=False)
        os.replace(temporary, final)

    def _load(self, filename: str) -> Dict[str, Any]:
        path = os.path.join(self.BASE_PATH, filename)
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)

    def save_properties(self, data: Dict[str, Any]) -> None:
        self._save("properties.json", data)

    def load_properties(self) -> Dict[str, Any]:
        return self._load("properties.json")

    def save_valuations(self, data: Dict[str, Any]) -> None:
        self._save("valuations.json", data)

    def save_rentals(self, data: Dict[str, Any]) -> None:
        self._save("rentals.json", data)

    def save_mortgages(self, data: Dict[str, Any]) -> None:
        self._save("mortgages.json", data)

    def save_market(self, data: Dict[str, Any]) -> None:
        self._save("market.json", data)