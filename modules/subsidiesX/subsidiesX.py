from typing import List

from modules.phase2_base import module_result


class SubsidiesX:
    PROGRAMS = [
        {"name": "ISDE", "measure": "warmtepomp", "regions": ["NL"], "status": "check eligibility"},
        {"name": "Nationaal Isolatieprogramma", "measure": "isolatie", "regions": ["NL"], "status": "check municipality"},
        {"name": "Lokale verduurzamingsregeling", "measure": "zonnepanelen", "regions": ["Amsterdam", "Utrecht", "Rotterdam"], "status": "regional"},
    ]

    def scan(self, region: str = "NL", measures: List[str] | None = None) -> dict:
        selected = set(item.lower() for item in (measures or []))
        matches = [
            program for program in self.PROGRAMS
            if (region in program["regions"] or "NL" in program["regions"])
            and (not selected or program["measure"] in selected)
        ]
        return module_result("SubsidiesX", {"region": region, "matches": matches, "energyLink": True})