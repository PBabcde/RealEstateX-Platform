from fastapi import APIRouter

from apps.realestateX_app.backend.services.rag_service import scan

router = APIRouter(prefix="/ragSuperEngineX", tags=["RAGSuperEngineX"])


@router.post("/scan")
def rag_scan(document_type: str, text: str) -> dict:
    return scan(document_type, text)