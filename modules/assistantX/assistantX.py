from typing import Any, Dict

from modules.phase2_base import module_result


class AssistantX:
    """Rule-based assistant boundary ready for a RAG provider."""

    INTENTS = {
        "waardering": ("waardering", "Ik kan een indicatieve waardering opzetten."),
        "huur": ("huur", "Ik kan huur, kosten en rendement naast elkaar zetten."),
        "financiering": ("financiering", "Ik kan een financieringsscenario doorrekenen."),
        "verduurzaming": ("verduurzaming", "Ik kan maatregelen en subsidies voor verduurzaming ordenen."),
        "aankoop": ("aankoop", "Ik kan een aankoopbesluit structureren met score en risico."),
    }

    def assist(self, question: str, context: Dict[str, Any] | None = None) -> dict:
        normalized = question.lower()
        intent, answer = next(
            (value for key, value in self.INTENTS.items() if key in normalized),
            ("vastgoed", "Ik kan je helpen een vastgoedvraag stap voor stap te verhelderen."),
        )
        return module_result("AssistantX", {
            "intent": intent,
            "answer": answer,
            "nextSteps": ["Controleer de brondata", "Vergelijk minimaal één alternatief"],
            "contextUsed": bool(context),
            "ragReady": True,
        })