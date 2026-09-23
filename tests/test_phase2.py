import time

from modules.assistantX.assistantX import AssistantX
from modules.chatBoxX.chatBoxX import ChatBoxX
from modules.dealEngineX.dealEngineX import DealEngineX
from modules.dealFinanceX.dealFinanceX import DealFinanceX
from modules.dealScoreX.dealScoreX import DealScoreX
from modules.greenX.greenX import GreenX
from modules.ragSuperEngineX.ragSuperEngineX import (
    DocumentValidationError,
    RAGSuperEngineX,
)
from modules.riskX.riskX import RiskX


def test_assistant_routes_real_estate_intent() -> None:
    result = AssistantX().assist("Wat is mijn huurrendement?")
    assert result["intent"] == "huur"
    assert result["ragReady"] is True


def test_chatbox_persists_a_reply() -> None:
    chat = ChatBoxX()
    session_id = chat.start("test-user")["sessionId"]
    chat.send(session_id, "Hoe werkt financiering?")
    history = chat.history(session_id)
    assert len(history["messages"]) == 2
    assert history["messages"][-1]["role"] == "assistant"


def test_deal_engine_returns_actionable_decision() -> None:
    result = DealEngineX().analyze(
        "aankoop",
        {"locatie": 85, "prijs": 80, "risico": 25, "rendement": 76, "markttrend": 72, "energielabel": 70},
    )
    assert result["decision"] in {"go", "hold", "reject"}
    assert 0 <= result["score"]["dealScore"] <= 100


def test_deal_finance_exposes_roi_and_irr() -> None:
    result = DealFinanceX().simulate(500000, 100000, 400000, 4, 30000)
    assert "roi" in result
    assert "irr" in result


def test_green_and_risk_engines_return_bounded_scores() -> None:
    assert 0 <= GreenX().assess("A", 100)["greenScore"] <= 100
    assert 0 <= RiskX().assess(market=75)["overallRisk"] <= 100


def test_rag_engine_extracts_key_document_fields() -> None:
    result = RAGSuperEngineX().scan(
        "koopakte",
        "Keizersgracht 148 voor €680.000 met rendement 4,5%",
    )
    assert result["extracted"]["prices"]
    assert result["filledTargets"] == ["CRM", "Deals", "Objecten", "Portfolio"]


def test_rag_retrieval_is_tenant_scoped_and_cited(tmp_path) -> None:
    rag = RAGSuperEngineX(str(tmp_path))
    rag.ingest_document(
        "tenant-a",
        "koopakte",
        "Keizersgracht 148 heeft een koopprijs van €680.000.",
        filename="koopakte.txt",
        document_id="doc-a",
    )

    passages = rag.retrieve("tenant-a", "Wat is de koopprijs?")
    assert passages[0]["documentId"] == "doc-a"
    assert passages[0]["citationId"] == "S1"
    assert rag.retrieve("tenant-b", "Wat is de koopprijs?") == []

    response = AssistantX().assist(
        "Wat is de koopprijs?",
        rag.retrieve_context("tenant-a", "Wat is de koopprijs?"),
    )
    assert response["contextUsed"] is True
    assert response["missingSources"] is False
    assert response["citations"][0]["documentId"] == "doc-a"


def test_rag_reports_missing_sources_and_supports_delete_and_retention(tmp_path) -> None:
    rag = RAGSuperEngineX(str(tmp_path))
    missing = AssistantX().assist(
        "Wat staat in mijn contract?",
        rag.retrieve_context("tenant-a", "Wat staat in mijn contract?"),
    )
    assert missing["missingSources"] is True
    assert "geen toegestane" in missing["answer"]

    rag.ingest_document(
        "tenant-a",
        "rapport",
        "Een korte bron.",
        filename="rapport.md",
        document_id="doc-expired",
    )
    index = rag._load()
    index["documents"]["doc-expired"]["expiresAt"] = "2000-01-01T00:00:00+00:00"
    rag._save(index)
    assert rag.purge_expired("tenant-a") == 1
    assert rag.delete_document("tenant-a", "doc-expired") is False

    try:
        rag.ingest_document("tenant-a", "contract", "unsafe", filename="../contract.exe")
    except DocumentValidationError:
        pass
    else:
        raise AssertionError("unsafe document was accepted")


def test_rag_retrieval_stays_within_small_corpus_latency_budget(tmp_path) -> None:
    rag = RAGSuperEngineX(str(tmp_path))
    for index in range(20):
        rag.ingest_document(
            "tenant-a",
            "market-report",
            f"Marktrapport {index}: Amsterdam huurprijs rendement locatie.",
            filename=f"report-{index}.txt",
        )

    started = time.perf_counter()
    passages = rag.retrieve("tenant-a", "Amsterdam huurprijs rendement")
    elapsed = time.perf_counter() - started

    assert passages
    assert elapsed < 2.0


def test_deal_score_includes_all_public_scores() -> None:
    result = DealScoreX().score({"locatie": 70, "prijs": 70, "risico": 30, "rendement": 80})
    assert {"dealScore", "chanceScore", "riskScore"} <= result.keys()