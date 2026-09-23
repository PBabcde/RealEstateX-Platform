"""Safe, provider-neutral document ingestion and retrieval.

The production API has a TypeScript adapter around the same deliberately small
retrieval contract.  This Python implementation is also used as the reference
implementation and quality-test fixture for the Phase 2 modules.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable
from uuid import uuid4

from modules.phase2_base import module_result


class DocumentValidationError(ValueError):
    """Raised when a document cannot safely enter the retrieval index."""


class RAGSuperEngineX:
    """Tenant-scoped document ingestion, chunking, indexing and retrieval."""

    MAX_DOCUMENT_CHARS = 5_000_000
    MAX_FILENAME_CHARS = 180
    CHUNK_SIZE = 900
    CHUNK_OVERLAP = 140
    EMBEDDING_DIMENSIONS = 96
    DEFAULT_RETENTION_DAYS = 365
    ALLOWED_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".json"}
    TOKEN_RE = re.compile(r"[^\W_]+", flags=re.UNICODE)

    def __init__(
        self,
        storage_path: str = os.path.join("storage", "realestateX"),
        *,
        retention_days: int = DEFAULT_RETENTION_DAYS,
    ) -> None:
        if retention_days < 1 or retention_days > 3_650:
            raise ValueError("retention_days must be between 1 and 3650")
        self.storage_path = storage_path
        self.retention_days = retention_days
        self.index_path = os.path.join(storage_path, "ragDocuments.json")

    @classmethod
    def _tokens(cls, text: str) -> list[str]:
        return [token.casefold() for token in cls.TOKEN_RE.findall(text)]

    @classmethod
    def _embedding(cls, text: str) -> list[float]:
        vector = [0.0] * cls.EMBEDDING_DIMENSIONS
        tokens = cls._tokens(text)
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % cls.EMBEDDING_DIMENSIONS
            vector[index] += 1.0 if digest[4] % 2 else -1.0
        norm = math.sqrt(sum(value * value for value in vector))
        return [round(value / norm, 8) for value in vector] if norm else vector

    @staticmethod
    def _cosine(left: Iterable[float], right: Iterable[float]) -> float:
        return sum(a * b for a, b in zip(left, right))

    @classmethod
    def _chunk_text(cls, text: str) -> list[str]:
        chunks: list[str] = []
        start = 0
        while start < len(text):
            end = min(len(text), start + cls.CHUNK_SIZE)
            if end < len(text):
                boundary = text.rfind(" ", start + cls.CHUNK_SIZE // 2, end)
                if boundary > start:
                    end = boundary
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end >= len(text):
                break
            start = max(end - cls.CHUNK_OVERLAP, start + 1)
        return chunks

    @classmethod
    def validate_document(
        cls,
        tenant_id: str,
        text: str,
        *,
        filename: str = "document.txt",
        document_type: str = "text",
    ) -> None:
        if not isinstance(tenant_id, str) or not tenant_id.strip():
            raise DocumentValidationError("tenant_id is required")
        if not isinstance(text, str) or not text.strip():
            raise DocumentValidationError("document text is required")
        if len(text) > cls.MAX_DOCUMENT_CHARS:
            raise DocumentValidationError("document exceeds the maximum size")
        if "\x00" in text:
            raise DocumentValidationError("document contains a NUL byte")
        if any(ord(char) < 32 and char not in "\n\r\t" for char in text):
            raise DocumentValidationError("document contains unsafe control characters")
        if not isinstance(filename, str) or not filename.strip():
            raise DocumentValidationError("filename is required")
        if len(filename) > cls.MAX_FILENAME_CHARS:
            raise DocumentValidationError("filename is too long")
        if os.path.basename(filename) != filename or filename in {".", ".."}:
            raise DocumentValidationError("filename must be a plain file name")
        extension = os.path.splitext(filename.casefold())[1]
        if extension and extension not in cls.ALLOWED_EXTENSIONS:
            raise DocumentValidationError("file type is not allowed")
        if not isinstance(document_type, str) or not document_type.strip():
            raise DocumentValidationError("document_type is required")
        if len(document_type) > 80 or any(ord(char) < 32 for char in document_type):
            raise DocumentValidationError("document_type is invalid")

    def _load(self) -> dict[str, Any]:
        if not os.path.exists(self.index_path):
            return {"version": 1, "documents": {}}
        try:
            with open(self.index_path, "r", encoding="utf-8") as handle:
                value = json.load(handle)
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError("RAG index is unreadable; refusing to recreate it") from error
        if not isinstance(value, dict) or not isinstance(value.get("documents"), dict):
            raise RuntimeError("RAG index has an invalid shape")
        return value

    def _save(self, data: dict[str, Any]) -> None:
        os.makedirs(self.storage_path, exist_ok=True)
        temporary = f"{self.index_path}.{os.getpid()}.tmp"
        with open(temporary, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, ensure_ascii=False)
        os.replace(temporary, self.index_path)

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def ingest_document(
        self,
        tenant_id: str,
        document_type: str,
        text: str,
        *,
        filename: str = "document.txt",
        document_id: str | None = None,
        retention_days: int | None = None,
    ) -> dict[str, Any]:
        self.validate_document(
            tenant_id,
            text,
            filename=filename,
            document_type=document_type,
        )
        days = self.retention_days if retention_days is None else retention_days
        if days < 1 or days > 3_650:
            raise DocumentValidationError("retention_days must be between 1 and 3650")
        now = self._now()
        identifier = document_id or str(uuid4())
        chunks = self._chunk_text(text)
        if not chunks:
            raise DocumentValidationError("document did not produce searchable text")
        record = {
            "documentId": identifier,
            "tenantId": tenant_id,
            "documentType": document_type,
            "filename": filename,
            "contentHash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "createdAt": now.isoformat(),
            "expiresAt": (now + timedelta(days=days)).isoformat(),
            "chunks": [
                {
                    "chunkId": f"{identifier}:{index}",
                    "text": chunk,
                    "embedding": self._embedding(chunk),
                    "index": index,
                }
                for index, chunk in enumerate(chunks)
            ],
        }
        data = self._load()
        data["documents"][identifier] = record
        self._save(data)
        return self._document_summary(record)

    def ingest(
        self,
        tenant_id: str,
        document_type: str,
        text: str,
        *,
        filename: str = "document.txt",
        document_id: str | None = None,
        retention_days: int | None = None,
    ) -> dict[str, Any]:
        """Short alias used by integrations and quality-test fixtures."""
        return self.ingest_document(
            tenant_id,
            document_type,
            text,
            filename=filename,
            document_id=document_id,
            retention_days=retention_days,
        )

    @staticmethod
    def _document_summary(document: dict[str, Any]) -> dict[str, Any]:
        return {
            key: document[key]
            for key in (
                "documentId",
                "tenantId",
                "documentType",
                "filename",
                "contentHash",
                "createdAt",
                "expiresAt",
            )
        } | {"chunkCount": len(document.get("chunks", []))}

    def list_documents(self, tenant_id: str) -> list[dict[str, Any]]:
        now = self._now()
        documents = self._load()["documents"].values()
        return [
            self._document_summary(document)
            for document in documents
            if document.get("tenantId") == tenant_id
            and datetime.fromisoformat(document["expiresAt"]) > now
        ]

    def retrieve(
        self,
        tenant_id: str,
        query: str,
        *,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        if not isinstance(query, str) or not query.strip():
            return []
        top_k = max(1, min(top_k, 20))
        query_tokens = set(self._tokens(query))
        query_embedding = self._embedding(query)
        now = self._now()
        ranked: list[tuple[float, dict[str, Any], dict[str, Any]]] = []
        for document in self._load()["documents"].values():
            if document.get("tenantId") != tenant_id:
                continue
            if datetime.fromisoformat(document["expiresAt"]) <= now:
                continue
            for chunk in document.get("chunks", []):
                chunk_tokens = set(self._tokens(chunk.get("text", "")))
                overlap = (
                    len(query_tokens & chunk_tokens) / len(query_tokens)
                    if query_tokens
                    else 0.0
                )
                score = 0.55 * self._cosine(query_embedding, chunk.get("embedding", []))
                score += 0.45 * overlap
                if overlap == 0 and score < 0.16:
                    continue
                citation_id = f"S{len(ranked) + 1}"
                passage = {
                    "citationId": citation_id,
                    "documentId": document["documentId"],
                    "chunkId": chunk["chunkId"],
                    "filename": document["filename"],
                    "documentType": document["documentType"],
                    "text": chunk["text"],
                    "quote": chunk["text"][:280],
                    "score": round(max(0.0, min(1.0, score)), 4),
                }
                ranked.append((score, passage, document))
        ranked.sort(key=lambda item: item[0], reverse=True)
        passages = [item[1] for item in ranked[:top_k]]
        for index, passage in enumerate(passages, start=1):
            passage["citationId"] = f"S{index}"
        return passages

    def retrieve_context(self, tenant_id: str, query: str, *, top_k: int = 5) -> dict[str, Any]:
        passages = self.retrieve(tenant_id, query, top_k=top_k)
        return {
            "passages": passages,
            "citations": [
                {
                    "citationId": passage["citationId"],
                    "documentId": passage["documentId"],
                    "chunkId": passage["chunkId"],
                    "filename": passage["filename"],
                    "quote": passage["quote"],
                    "score": passage["score"],
                }
                for passage in passages
            ],
            "missingSources": not bool(passages),
        }

    def delete_document(self, tenant_id: str, document_id: str) -> bool:
        data = self._load()
        document = data["documents"].get(document_id)
        if not document or document.get("tenantId") != tenant_id:
            return False
        del data["documents"][document_id]
        self._save(data)
        return True

    def purge_expired(self, tenant_id: str | None = None) -> int:
        data = self._load()
        now = self._now()
        expired = [
            identifier
            for identifier, document in data["documents"].items()
            if datetime.fromisoformat(document["expiresAt"]) <= now
            and (tenant_id is None or document.get("tenantId") == tenant_id)
        ]
        for identifier in expired:
            del data["documents"][identifier]
        if expired:
            self._save(data)
        return len(expired)

    def scan(self, document_type: str, text: str) -> dict:
        """Backward-compatible extraction surface, now backed by safe validation."""
        self.validate_document("scan", text, document_type=document_type)
        prices = re.findall(r"€\s?[\d.]+", text)
        addresses = re.findall(
            r"\b[A-Z][\wÀ-ÿ-]+(?:straat|laan|gracht|weg)\s+\d+\b",
            text,
            flags=re.IGNORECASE,
        )
        percentages = re.findall(r"\b\d+(?:[,.]\d+)?%", text)
        extracted = {"addresses": addresses, "prices": prices, "rentData": percentages, "risks": []}
        return module_result(
            "RAGSuperEngineX",
            {
                "documentType": document_type,
                "extracted": extracted,
                "filledTargets": ["CRM", "Deals", "Objecten", "Portfolio"],
                "readyForProvider": True,
            },
        )