from typing import Any, Dict

from modules.assistantX.assistantX import AssistantX

service = AssistantX()


def ask(question: str, context: Dict[str, Any] | None = None) -> dict:
    return service.assist(question, context)
