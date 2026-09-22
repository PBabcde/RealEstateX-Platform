from modules.ragSuperEngineX.ragSuperEngineX import RAGSuperEngineX

service = RAGSuperEngineX()


def scan(document_type: str, text: str) -> dict:
    return service.scan(document_type, text)