from typing import Any, Dict

from modules.phase2_base import module_result


class AssistantX:
    """Grounded assistant boundary that never treats arbitrary input as sources."""

    INTENTS = {
        "waardering": ("waardering", "Ik kan een indicatieve waardering opzetten."),
        "huur": ("huur", "Ik kan huur, kosten en rendement naast elkaar zetten."),
        "financiering": ("financiering", "Ik kan een financieringsscenario doorrekenen."),
        "verduurzaming": ("verduurzaming", "Ik kan maatregelen en subsidies voor verduurzaming ordenen."),
        "aankoop": ("aankoop", "Ik kan een aankoopbesluit structureren met score en risico."),
    }

    @staticmethod
    def _allowed_passages(context: Dict[str, Any] | None) -> list[dict[str, Any]]:
        if not isinstance(context, dict):
            return []
        passages = context.get("passages")
        if not isinstance(passages, list):
            return []
        allowed: list[dict[str, Any]] = []
        for passage in passages:
            if not isinstance(passage, dict):
                continue
            required = ("citationId", "documentId", "chunkId", "filename", "text")
            if not all(isinstance(passage.get(key), str) and passage[key] for key in required):
                continue
            if not isinstance(passage.get("score"), (int, float)) or passage["score"] < 0:
                continue
            allowed.append(passage)
        return allowed

    def assist(self, question: str, context: Dict[str, Any] | None = None) -> dict:
        normalized = question.lower()
        intent, fallback = next(
            (value for key, value in self.INTENTS.items() if key in normalized),
            ("vastgoed", "Ik kan je helpen een vastgoedvraag stap voor stap te verhelderen."),
        )
        passages = self._allowed_passages(context)
        citations = [
            {
                "citationId": passage["citationId"],
                "documentId": passage["documentId"],
                "chunkId": passage["chunkId"],
                "filename": passage["filename"],
                "quote": passage["text"][:280],
                "score": round(float(passage["score"]), 4),
            }
            for passage in passages
        ]
        if passages:
            answer = (
                f"{fallback} Volgens {', '.join(citation['citationId'] for citation in citations)}: "
                f"{passages[0]['text'][:500]}"
            )
        else:
            answer = (
                "Ik kan dit niet betrouwbaar beantwoorden: er is geen toegestane, "
                "relevante documentbron gevonden."
            )
        return module_result(
            "AssistantX",
            {
                "intent": intent,
                "answer": answer,
                "nextSteps": ["Controleer de brondata", "Vergelijk minimaal één alternatief"],
                "contextUsed": bool(citations),
                "citations": citations,
                "missingSources": not bool(citations),
                "ragReady": True,
            },
        )