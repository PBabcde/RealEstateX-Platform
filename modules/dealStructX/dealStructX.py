from modules.phase2_base import module_result


class DealStructX:
    ADVICE = {
        "privé": "Geschikt voor een overzichtelijke, persoonlijke investering.",
        "BV": "Geschikt wanneer risico en administratie zakelijk moeten worden afgebakend.",
        "holding": "Interessant bij meerdere activiteiten of een bredere portefeuille.",
        "investeerderspool": "Geschikt wanneer kapitaal en risico over meerdere deelnemers worden verdeeld.",
    }

    def advise(self, scenario: str) -> dict:
        key = scenario.lower()
        return module_result("DealStructX", {
            "scenario": scenario,
            "advice": self.ADVICE.get(key, "Vergelijk privé, BV en holding met een fiscalist."),
            "alternatives": list(self.ADVICE.keys()),
        })