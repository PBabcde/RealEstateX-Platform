from fastapi import APIRouter

from apps.realestateX_app.backend.services.chatbox_service import history, send, start

router = APIRouter(prefix="/chat", tags=["ChatBoxX"])


@router.post("/start")
def start_chat(user_id: str = "default") -> dict:
    return start(user_id)


@router.post("/send")
def send_chat(session_id: str, message: str) -> dict:
    return send(session_id, message)


@router.get("/history")
def chat_history(session_id: str) -> dict:
    return history(session_id)