import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  AskAssistantBody,
  AskAssistantResponse,
  DeleteAssistantDocumentParams,
  IngestAssistantDocumentBody,
  IngestAssistantDocumentResponse,
  ListAssistantDocumentsResponse,
  RetrieveAssistantContextBody,
  RetrieveAssistantContextResponse,
  GetChatHistoryQueryParams,
  GetChatHistoryResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
  StartChatBody,
  StartChatResponse,
} from "@workspace/api-zod";
import {
  appendChatMessages,
  createChatSession,
  getChatSession,
  initialiseRealEstateStorage,
  type ChatMessageRecord,
} from "../lib/realestatex-storage";
import {
  citationsFor,
  deleteDocument,
  ingestDocument,
  listDocuments,
  retrieveDocuments,
  type RagPassage,
} from "../lib/rag-storage";
import {
  forbidden,
  isAdministrator,
  requireAuthentication,
} from "../middlewares/authorization";
import { attachEnterpriseContext } from "../lib/enterprise-core-access";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  at: string;
};

type ChatSession = {
  sessionId: string;
  userId: string;
  createdAt: string;
  messages: ChatMessage[];
};

const router: IRouter = Router();
router.use(requireAuthentication);
router.use(attachEnterpriseContext);
router.use(async (_req, _res, next): Promise<void> => {
  try {
    await initialiseRealEstateStorage();
    next();
  } catch (error) {
    next(error);
  }
});

function now(): string {
  return new Date().toISOString();
}

function assistantReply(question: string): {
  intent: string;
  answer: string;
  nextSteps: string[];
} {
  const normalized = question.toLowerCase();
  if (normalized.includes("huur")) {
    return {
      intent: "huur",
      answer: "Ik kan huur, kosten en rendement naast elkaar zetten.",
      nextSteps: [
        "Vul de huurprijs en vaste kosten in",
        "Vergelijk het rendement met je financiering",
      ],
    };
  }
  if (normalized.includes("financier") || normalized.includes("hypotheek")) {
    return {
      intent: "financiering",
      answer: "Ik kan een financieringsscenario doorrekenen.",
      nextSteps: [
        "Bepaal eigen geld en lening",
        "Vergelijk rente en maandlasten",
      ],
    };
  }
  if (normalized.includes("waarde") || normalized.includes("waardering")) {
    return {
      intent: "waardering",
      answer: "Ik kan een indicatieve waardering opzetten.",
      nextSteps: [
        "Controleer woonoppervlak en energielabel",
        "Vergelijk met actuele marktdata",
      ],
    };
  }
  if (normalized.includes("duurzaam") || normalized.includes("isolat")) {
    return {
      intent: "verduurzaming",
      answer: "Ik kan maatregelen en subsidies voor verduurzaming ordenen.",
      nextSteps: [
        "Bepaal de huidige energieprestatie",
        "Scan relevante subsidies per regio",
      ],
    };
  }
  return {
    intent: "vastgoed",
    answer: "Ik help je deze vastgoedvraag stap voor stap te verhelderen.",
    nextSteps: [
      "Beschrijf het object of de deal",
      "Kies een scenario om door te rekenen",
    ],
  };
}

function assistantResponse(question: string, passages: RagPassage[]) {
  const citations = citationsFor(passages);
  const reply = assistantReply(question);
  return {
    status: "ok" as const,
    module: "AssistantX",
    ...reply,
    answer: passages.length
      ? `${reply.answer} Volgens ${citations.map((citation) => citation.citationId).join(", ")}: ${passages[0].text.slice(0, 500)}`
      : "Ik kan dit niet betrouwbaar beantwoorden: er is geen toegestane, relevante documentbron gevonden.",
    contextUsed: passages.length > 0,
    citations,
    missingSources: passages.length === 0,
    ragReady: true,
  };
}

router.post("/assistant/ask", async (req, res): Promise<void> => {
  const body = AskAssistantBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const passages = await retrieveDocuments(
    req.user!.id,
    body.data.question,
    req.enterpriseContext!.tenantId,
  );
  res.json(
    AskAssistantResponse.parse(assistantResponse(body.data.question, passages)),
  );
});

router.get("/assistant/documents", async (req, res): Promise<void> => {
  const documents = await listDocuments(
    req.user!.id,
    req.enterpriseContext!.tenantId,
  );
  res.json(ListAssistantDocumentsResponse.parse({ status: "ok", documents }));
});

router.post("/assistant/documents", async (req, res): Promise<void> => {
  const body = IngestAssistantDocumentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const document = await ingestDocument({
      ownerId: req.user!.id,
      tenantId: req.enterpriseContext!.tenantId,
      filename: body.data.filename,
      content: body.data.content,
      contentType: body.data.contentType,
      documentType: body.data.documentType,
      retentionDays: body.data.retentionDays,
    });
    res
      .status(201)
      .json(IngestAssistantDocumentResponse.parse({ status: "ok", document }));
  } catch (error) {
    res
      .status(400)
      .json({
        error: error instanceof Error ? error.message : "Invalid document",
      });
  }
});

router.delete(
  "/assistant/documents/:documentId",
  async (req, res): Promise<void> => {
    const params = DeleteAssistantDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const deleted = await deleteDocument(
      req.user!.id,
      params.data.documentId,
      req.enterpriseContext!.tenantId,
    );
    if (!deleted) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.status(204).send();
  },
);

router.post("/assistant/retrieve", async (req, res): Promise<void> => {
  const body = RetrieveAssistantContextBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const passages = await retrieveDocuments(
    req.user!.id,
    body.data.query,
    req.enterpriseContext!.tenantId,
    body.data.topK,
  );
  res.json(
    RetrieveAssistantContextResponse.parse({
      status: "ok",
      passages,
      citations: citationsFor(passages),
      missingSources: passages.length === 0,
    }),
  );
});

router.post("/chat/start", async (req, res): Promise<void> => {
  const body = StartChatBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const sessionId = `chat-${randomUUID()}`;
  const session: ChatSession = {
    sessionId,
    userId: req.user!.id,
    createdAt: now(),
    messages: [],
  };
  await createChatSession(session, req.enterpriseContext!.tenantId);
  res
    .status(201)
    .json(
      StartChatResponse.parse({ status: "ok", module: "ChatBoxX", sessionId }),
    );
});

router.post("/chat/send", async (req, res): Promise<void> => {
  const body = SendChatMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const session = await getChatSession(
    body.data.sessionId,
    undefined,
    req.enterpriseContext!.tenantId,
  );
  if (!session) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }
  if (!isAdministrator(req) && session.userId !== req.user!.id) {
    forbidden(res);
    return;
  }
  const passages = await retrieveDocuments(
    req.user!.id,
    body.data.message,
    req.enterpriseContext!.tenantId,
  );
  const reply = assistantResponse(body.data.message, passages);
  const updated = await appendChatMessages(
    body.data.sessionId,
    [
      { role: "user", content: body.data.message, at: now() },
      { role: "assistant", content: reply.answer, at: now() },
    ],
    isAdministrator(req) ? undefined : req.user!.id,
    req.enterpriseContext!.tenantId,
  );
  if (!updated) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }
  res.json(
    SendChatMessageResponse.parse({
      status: "ok",
      module: "ChatBoxX",
      sessionId: body.data.sessionId,
      reply,
    }),
  );
});

router.get("/chat/history", async (req, res): Promise<void> => {
  const query = GetChatHistoryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const session = await getChatSession(
    query.data.sessionId,
    undefined,
    req.enterpriseContext!.tenantId,
  );
  if (!session) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }
  if (!isAdministrator(req) && session.userId !== req.user!.id) {
    forbidden(res);
    return;
  }
  res.json(
    GetChatHistoryResponse.parse({
      status: "ok",
      module: "ChatBoxX",
      sessionId: query.data.sessionId,
      messages: session.messages,
    }),
  );
});

export default router;
