import { Router, type IRouter } from "express";
import {
  readJson,
  writeJson,
} from "../lib/realestatex-storage";

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

router.post("/assistant/ask", (req, res): void => {
  const question = req.body?.question;
  if (typeof question !== "string" || !question.trim()) {
    res.status(400).json({ error: "question is required" });
    return;
  }
  res.json({
    status: "ok",
    module: "AssistantX",
    ...assistantReply(question),
    contextUsed: Boolean(req.body?.context),
    ragReady: true,
  });
});

router.post("/chat/start", (req, res): void => {
  const sessions = readJson<Record<string, ChatSession>>("chatBoxX.json", {});
  const sessionId = `chat-${Date.now().toString(36)}`;
  sessions[sessionId] = {
    sessionId,
    userId: typeof req.body?.userId === "string" ? req.body.userId : "default",
    createdAt: now(),
    messages: [],
  };
  writeJson("chatBoxX.json", sessions);
  res.status(201).json({ status: "ok", module: "ChatBoxX", sessionId });
});

router.post("/chat/send", (req, res): void => {
  const { sessionId, message } = req.body ?? {};
  if (typeof sessionId !== "string" || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "sessionId and message are required" });
    return;
  }
  const sessions = readJson<Record<string, ChatSession>>("chatBoxX.json", {});
  const session = sessions[sessionId];
  if (!session) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }
  const reply = assistantReply(message);
  session.messages.push({ role: "user", content: message, at: now() });
  session.messages.push({ role: "assistant", content: reply.answer, at: now() });
  writeJson("chatBoxX.json", sessions);
  res.json({ status: "ok", module: "ChatBoxX", sessionId, reply });
});

router.get("/chat/history", (req, res): void => {
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : "";
  const sessions = readJson<Record<string, ChatSession>>("chatBoxX.json", {});
  const session = sessions[sessionId];
  if (!session) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }
  res.json({ status: "ok", module: "ChatBoxX", sessionId, messages: session.messages });
});

export default router;