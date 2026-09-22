from typing import Any, Dict

from modules.phase2_base import module_result


class DIYX:
    """Creates practical renovation and transformation plans."""

    PLANS = {
        "splitsen": ["Haalbaarheid en vergunningcheck", "Ontwerp nieuwe units", "Technische opname", "Realisatie en oplevering"],
        "transformeren": ["Programma van eisen", "Bestemmingsplan controleren", "Ontwerp en begroting", "Gefaseerde uitvoering"],
        "verduurzamen": ["Energiescan", "Isolatieplan", "Installatiekeuze", "Monitoring van besparing"],
        "verbouwen": ["Wensen vastleggen", "Offertes vergelijken", "Planning maken", "Bouwbegeleiding"],
    }

    def plan(self, project_type: str, budget: float = 0) -> dict:
        steps = self.PLANS.get(project_type.lower(), self.PLANS["verbouwen"])
        warnings = ["Laat constructie en vergunningen door een specialist controleren."]
        if budget and budget < 25000:
            warnings.append("Het budget kan krap zijn voor een volledige transformatie.")
        return module_result("DIYX", {
            "projectType": project_type,
            "steps": steps,
            "costPlan": {"estimatedBudget": budget or 45000, "contingency": 0.15},
            "materials": ["Meetrapport", "Ontwerptekeningen", "Vergunningstukken", "Offerteoverzicht"],
            "youtubeLinks": [],
            "warnings": warnings,
        })