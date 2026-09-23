import { createHash, randomUUID } from "node:crypto";
import { readModuleData, writeModuleData } from "./realestatex-storage";

export type RagCitation = {
  citationId: string;
  documentId: string;
  chunkId: string;
  filename: string;
  quote: string;
  score: number;
};

export type RagPassage = RagCitation & {
  documentType: string;
  text: string;
};

export type RagDocumentSummary = {
  documentId: string;
  filename: string;
  documentType: string;
  contentHash: string;
  createdAt: string;
  expiresAt: string;
  chunkCount: number;
};

type RagChunk = {
  chunkId: string;
  text: string;
  embedding: number[];
  index: number;
};

type RagDocument = RagDocumentSummary & {
  ownerId: string;
  chunks: RagChunk[];
};

type RagIndex = {
  version: 1;
  documents: Record<string, RagDocument>;
};

const MAX_DOCUMENT_CHARS = 250_000;
const MAX_FILENAME_CHARS = 180;
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 140;
const EMBEDDING_DIMENSIONS = 96;
const DEFAULT_RETENTION_DAYS = 365;
const ALLOWED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
]);
const ALLOWED_CONTENT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

function tokens(text: string): string[] {
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function embedding(text: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  for (const token of tokens(text)) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
    vector[index] += digest[4] % 2 === 0 ? -1 : 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0
    ? vector
    : vector.map((value) => Number((value / norm).toFixed(8)));
}

function cosine(left: number[], right: number[]): number {
  return left.reduce(
    (sum, value, index) => sum + value * (right[index] ?? 0),
    0,
  );
}

function chunks(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + CHUNK_SIZE);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start + Math.floor(CHUNK_SIZE / 2)) end = boundary;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) result.push(chunk);
    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return result;
}

function tenantKey(ownerId: string): string {
  return `ragDocuments-${createHash("sha256").update(ownerId).digest("hex").slice(0, 24)}.json`;
}

function validateDocument(
  filename: string,
  content: string,
  contentType?: string,
): void {
  if (
    !filename ||
    filename.length > MAX_FILENAME_CHARS ||
    filename !== filename.trim()
  ) {
    throw new Error("filename is required and must be at most 180 characters");
  }
  if (
    filename !== filename.split(/[\\/]/).pop() ||
    filename === "." ||
    filename === ".."
  ) {
    throw new Error("filename must be a plain file name");
  }
  const extension = filename
    .slice(filename.lastIndexOf("."))
    .toLocaleLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension))
    throw new Error("file type is not allowed");
  if (
    contentType &&
    !ALLOWED_CONTENT_TYPES.has(contentType.toLocaleLowerCase())
  ) {
    throw new Error("content type is not allowed");
  }
  if (!content || !content.trim())
    throw new Error("document content is required");
  if (content.length > MAX_DOCUMENT_CHARS)
    throw new Error("document exceeds the maximum size");
  if (content.includes("\0")) throw new Error("document contains a NUL byte");
  for (const character of content) {
    if (
      character.charCodeAt(0) < 32 &&
      !["\n", "\r", "\t"].includes(character)
    ) {
      throw new Error("document contains unsafe control characters");
    }
  }
}

function validateDocumentType(documentType: string | undefined): void {
  if (!documentType) return;
  if (documentType.length > 80 || /[\u0000-\u001f]/u.test(documentType)) {
    throw new Error("documentType is invalid");
  }
}

async function loadIndex(ownerId: string): Promise<RagIndex> {
  return readModuleData<RagIndex>(tenantKey(ownerId), {
    version: 1,
    documents: {},
  });
}

async function saveIndex(
  ownerId: string,
  index: RagIndex,
  tenantId: string,
): Promise<void> {
  await writeModuleData(tenantKey(ownerId), index, tenantId);
}

function summary(document: RagDocument): RagDocumentSummary {
  return {
    documentId: document.documentId,
    filename: document.filename,
    documentType: document.documentType,
    contentHash: document.contentHash,
    createdAt: document.createdAt,
    expiresAt: document.expiresAt,
    chunkCount: document.chunks.length,
  };
}

export async function ingestDocument(input: {
  ownerId: string;
  tenantId: string;
  filename: string;
  content: string;
  contentType?: string;
  documentType?: string;
  retentionDays?: number;
}): Promise<RagDocumentSummary> {
  validateDocument(input.filename, input.content, input.contentType);
  validateDocumentType(input.documentType);
  const retentionDays = input.retentionDays ?? DEFAULT_RETENTION_DAYS;
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > 3_650
  ) {
    throw new Error("retentionDays must be between 1 and 3650");
  }
  const textChunks = chunks(input.content);
  if (!textChunks.length)
    throw new Error("document did not produce searchable text");
  const now = new Date();
  const documentId = `doc-${randomUUID()}`;
  const document: RagDocument = {
    documentId,
    ownerId: input.ownerId,
    filename: input.filename,
    documentType:
      input.documentType?.trim() ||
      input.filename.slice(input.filename.lastIndexOf(".") + 1),
    contentHash: createHash("sha256").update(input.content).digest("hex"),
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + retentionDays * 86_400_000,
    ).toISOString(),
    chunkCount: textChunks.length,
    chunks: textChunks.map((text, index) => ({
      chunkId: `${documentId}:${index}`,
      text,
      embedding: embedding(text),
      index,
    })),
  };
  const index = await loadIndex(input.ownerId);
  index.documents[documentId] = document;
  await saveIndex(input.ownerId, index, input.tenantId);
  return summary(document);
}

export async function listDocuments(
  ownerId: string,
  tenantId: string,
): Promise<RagDocumentSummary[]> {
  await purgeExpiredDocuments(ownerId, tenantId);
  const index = await loadIndex(ownerId);
  const now = Date.now();
  return Object.values(index.documents)
    .filter((document) => Date.parse(document.expiresAt) > now)
    .map(summary);
}

export async function deleteDocument(
  ownerId: string,
  documentId: string,
  tenantId: string,
): Promise<boolean> {
  const index = await loadIndex(ownerId);
  const document = index.documents[documentId];
  if (!document) return false;
  delete index.documents[documentId];
  await saveIndex(ownerId, index, tenantId);
  return true;
}

export async function purgeExpiredDocuments(
  ownerId: string | undefined,
  tenantId: string,
): Promise<number> {
  if (!ownerId) return 0;
  const index = await loadIndex(ownerId);
  const expired = Object.keys(index.documents).filter(
    (documentId) =>
      Date.parse(index.documents[documentId].expiresAt) <= Date.now(),
  );
  for (const documentId of expired) delete index.documents[documentId];
  if (expired.length) await saveIndex(ownerId, index, tenantId);
  return expired.length;
}

export async function retrieveDocuments(
  ownerId: string,
  query: string,
  tenantId: string,
  topK = 5,
): Promise<RagPassage[]> {
  if (!query.trim()) return [];
  await purgeExpiredDocuments(ownerId, tenantId);
  const boundedTopK = Math.max(1, Math.min(Math.floor(topK), 20));
  const queryTokens = new Set(tokens(query));
  const queryEmbedding = embedding(query);
  const index = await loadIndex(ownerId);
  const ranked: Array<{ score: number; passage: RagPassage }> = [];
  for (const document of Object.values(index.documents)) {
    if (Date.parse(document.expiresAt) <= Date.now()) continue;
    for (const chunk of document.chunks) {
      const chunkTokens = new Set(tokens(chunk.text));
      const overlap = queryTokens.size
        ? [...queryTokens].filter((token) => chunkTokens.has(token)).length /
          queryTokens.size
        : 0;
      const score =
        0.55 * cosine(queryEmbedding, chunk.embedding) + 0.45 * overlap;
      if (overlap === 0 && score < 0.16) continue;
      ranked.push({
        score,
        passage: {
          citationId: "",
          documentId: document.documentId,
          chunkId: chunk.chunkId,
          filename: document.filename,
          documentType: document.documentType,
          text: chunk.text,
          quote: chunk.text.slice(0, 280),
          score: Math.max(0, Math.min(1, Number(score.toFixed(4)))),
        },
      });
    }
  }
  ranked.sort((left, right) => right.score - left.score);
  return ranked.slice(0, boundedTopK).map(({ passage }, index) => ({
    ...passage,
    citationId: `S${index + 1}`,
  }));
}

export function citationsFor(passages: RagPassage[]): RagCitation[] {
  return passages.map(
    ({ citationId, documentId, chunkId, filename, quote, score }) => ({
      citationId,
      documentId,
      chunkId,
      filename,
      quote,
      score,
    }),
  );
}
