from typing import Any, Dict

from fastapi import APIRouter

from apps.realestateX_app.backend.services.assistant_service import ask

router = APIRouter(prefix="/assistantX", tags=["AssistantX"])


@router.post("/ask")
def ask_assistant(question: str, context: Dict[str, Any] | None = None) -> dict:
    return ask(question, context)