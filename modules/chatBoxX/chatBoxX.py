from typing import Any, Dict

from modules.assistantX.assistantX import AssistantX
from modules.phase2_base import load_module, module_result, save_module, timestamp


class ChatBoxX:
    """Persisted conversational interface connected to AssistantX."""

    def __init__(self) -> None:
        self.sessions = load_module("chatBoxX", {})
        self.assistant = AssistantX()

    def start(self, user_id: str = "default") -> dict:
        session_id = f"chat-{len(self.sessions) + 1:04d}"
        self.sessions[session_id] = {
            "sessionId": session_id, "userId": user_id, "messages": [], "createdAt": timestamp()
        }
        save_module("chatBoxX", self.sessions)
        return module_result("ChatBoxX", {"sessionId": session_id})

    def send(self, session_id: str, message: str) -> dict:
        if session_id not in self.sessions:
            raise KeyError("chat session not found")
        session = self.sessions[session_id]
        session["messages"].append({"role": "user", "content": message, "at": timestamp()})
        response = self.assistant.assist(message)
        session["messages"].append({"role": "assistant", "content": response["answer"], "at": timestamp()})
        save_module("chatBoxX", self.sessions)
        return module_result("ChatBoxX", {"sessionId": session_id, "reply": response})

    def history(self, session_id: str) -> dict:
        session = self.sessions.get(session_id)
        if not session:
            raise KeyError("chat session not found")
        return module_result("ChatBoxX", {"sessionId": session_id, "messages": session["messages"]})