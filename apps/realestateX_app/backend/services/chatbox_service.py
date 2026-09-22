from modules.chatBoxX.chatBoxX import ChatBoxX

service = ChatBoxX()


def start(user_id: str = "default") -> dict:
    return service.start(user_id)


def send(session_id: str, message: str) -> dict:
    return service.send(session_id, message)


def history(session_id: str) -> dict:
    return service.history(session_id)
