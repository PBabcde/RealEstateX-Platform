from modules.phase2_base import clamp, module_result


class GreenX:
    LABEL_SCORES = {"A++++": 100, "A+++": 95, "A++": 90, "A+": 85, "A": 80, "B": 65, "C": 50, "D": 35, "E": 20, "F": 10, "G": 0}

    def assess(self, energielabel: str = "C", area: float = 0) -> dict:
        score = self.LABEL_SCORES.get(energielabel.upper(), 40)
        savings = max(0, round(area * (score / 100) * 6.5, 2))
        return module_result("GreenX", {"energielabel": energielabel, "greenScore": score, "estimatedCo2Savings": savings, "energyLink": True})