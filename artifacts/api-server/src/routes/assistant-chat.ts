import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  AskAssistantBody,
  AskAssistantResponse,
  GetChatHistoryQueryParams,
  GetChatHistoryResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
  StartChatBody,
  StartChatResponse,
} from "@workspace/api-zod";
import { readJson, writeJson } from "../lib/realestatex-storage";

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
      nextSteps: ["Vul de huurprijs en vaste kosten in", "Vergelijk het rendement met je financiering"],
    };
  }
  if (normalized.includes("financier") || normalized.includes("hypotheek")) {
    return {
      intent: "financiering",
      answer: "Ik kan een financieringsscenario doorrekenen.",
      nextSteps: ["Bepaal eigen geld en lening", "Vergelijk rente en maandlasten"],
    };
  }
  if (normalized.includes("waarde") || normalized.includes("waardering")) {
    return {
      intent: "waardering",
      answer: "Ik kan een indicatieve waardering opzetten.",
      nextSteps: ["Controleer woonoppervlak en energielabel", "Vergelijk met actuele marktdata"],
    };
  }
  if (normalized.includes("duurzaam") || normalized.includes("isolat")) {
    return {
      intent: "verduurzaming",
      answer: "Ik kan maatregelen en subsidies voor verduurzaming ordenen.",
      nextSteps: ["Bepaal de huidige energieprestatie", "Scan relevante subsidies per regio"],
    };
  }
  return {
    intent: "vastgoed",
    answer: "Ik help je deze vastgoedvraag stap voor stap te verhelderen.",
    nextSteps: ["Beschrijf het object of de deal", "Kies een scenario om door te rekenen"],
  };
}

function assistantResponse(question: string, context?: unknown) {
  return {
    status: "ok" as const,
    module: "AssistantX",
    ...assistantReply(question),
    contextUsed: Boolean(context),
    ragReady: true,
  };
}

router.post("/assistant/ask", (req, res): void => {
  const body = AskAssistantBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  res.json(AskAssistantResponse.parse(assistantResponse(body.data.question, body.data.context)));
});

router.post("/chat/start", (req, res): void => {
  const body = StartChatBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const sessions = readJson<Record<string, ChatSession>>("chatBoxX.json", {});
  const sessionId = `chat-${randomUUID()}`;
  sessions[sessionId] = {
    sessionId,
    userId: body.data.userId ?? "default",
    createdAt: now(),
    messages: [],
  };
  writeJson("chatBoxX.json", sessions);
  res.status(201).json(StartChatResponse.parse({ status: "ok", module: "ChatBoxX", sessionId }));
});

router.post("/chat/send", (req, res): void => {
  const body = SendChatMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const sessions = readJson<Record<string, ChatSession>>("chatBoxX.json", {});
  const session = sessions[body.data.sessionId];
  if (!session) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }
  const reply = assistantResponse(body.data.message);
  session.messages.push({ role: "user", content: body.data.message, at: now() });
  session.messages.push({ role: "assistant", content: reply.answer, at: now() });
  writeJson("chatBoxX.json", sessions);
  res.json(SendChatMessageResponse.parse({
    status: "ok",
    module: "ChatBoxX",
    sessionId: body.data.sessionId,
    reply,
  }));
});

router.get("/chat/history", (req, res): void => {
  const query = GetChatHistoryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const sessions = readJson<Record<string, ChatSession>>("chatBoxX.json", {});
  const session = sessions[query.data.sessionId];
  if (!session) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }
  res.json(GetChatHistoryResponse.parse({
    status: "ok",
    module: "ChatBoxX",
    sessionId: query.data.sessionId,
    messages: session.messages,
  }));
});

export default router;