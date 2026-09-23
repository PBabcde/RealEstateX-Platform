import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditEventsTable,
  chatMessagesTable,
  chatSessionsTable,
  moduleDataTable,
  propertiesTable,
} from "@workspace/db/schema";
import { registerTrustMetadata } from "./enterprise-core";

export type PropertyRecord = {
  propertyId: string;
  adres: string;
  type: string;
  bouwjaar: number;
  woonoppervlak: number;
  perceel?: number;
  energielabel: string;
  kenmerken?: Record<string, string>;
};

export type ChatMessageRecord = {
  role: "user" | "assistant";
  content: string;
  at: string;
};

export type ChatSessionRecord = {
  sessionId: string;
  userId: string;
  createdAt: string;
  messages: ChatMessageRecord[];
};

export type AuditEventRecord = {
  eventId: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorId?: string;
  metadata: Record<string, unknown>;
  at: string;
};

const storagePath = path.join(process.cwd(), "storage", "realestateX");
const postgresEnabled = Boolean(db);
export const storageMode: "postgres" | "json" = postgresEnabled
  ? "postgres"
  : "json";

const initialProperties: Record<string, PropertyRecord> = {
  "ams-001": {
    propertyId: "ams-001",
    adres: "Keizersgracht 148, Amsterdam",
    type: "Appartement",
    bouwjaar: 1904,
    woonoppervlak: 86,
    perceel: 0,
    energielabel: "B",
    kenmerken: {
      kamers: "3",
      huurprijs: "2450",
      kosten: "4800",
      investering: "680000",
    },
  },
  "utr-002": {
    propertyId: "utr-002",
    adres: "Maliebaan 42, Utrecht",
    type: "Herenhuis",
    bouwjaar: 1932,
    woonoppervlak: 142,
    perceel: 118,
    energielabel: "A",
    kenmerken: {
      kamers: "5",
      huurprijs: "3200",
      kosten: "7200",
      investering: "815000",
    },
  },
  "rtd-003": {
    propertyId: "rtd-003",
    adres: "Witte de Withstraat 61, Rotterdam",
    type: "Bovenwoning",
    bouwjaar: 1911,
    woonoppervlak: 74,
    perceel: 0,
    energielabel: "C",
    kenmerken: {
      kamers: "2",
      huurprijs: "1850",
      kosten: "3600",
      investering: "420000",
    },
  },
};

const defaultMarket = {
  status: "ok",
  trend: "Stijgende markt in stedelijke gebieden",
  change: 3.7,
  period: "Q3 2026",
};
let initialisationPromise: Promise<void> | undefined;

function ensureStorage(): void {
  fs.mkdirSync(storagePath, { recursive: true });
}

function filePath(filename: string): string {
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    throw new Error(`Invalid storage filename: "${filename}"`);
  }
  ensureStorage();
  return path.join(storagePath, filename);
}

export function readJson<T>(filename: string, fallback: T): T {
  const target = filePath(filename);
  if (!fs.existsSync(target)) {
    writeJson(filename, fallback);
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as T;
  } catch (error) {
    throw new Error(
      `Storage file "${filename}" is unreadable or contains invalid JSON`,
      { cause: error },
    );
  }
}

export function writeJson<T>(filename: string, data: T): void {
  const target = filePath(filename);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temporary, target);
}

function requirePostgres() {
  if (!db) {
    throw new Error(
      "PostgreSQL storage is not configured. Set DATABASE_URL or explicitly run one API instance with JSON storage.",
    );
  }
  return db;
}

function propertyFromRow(row: typeof propertiesTable.$inferSelect): PropertyRecord {
  return {
    propertyId: row.propertyId,
    adres: row.adres,
    type: row.type,
    bouwjaar: row.bouwjaar,
    woonoppervlak: row.woonoppervlak,
    ...(row.perceel == null ? {} : { perceel: row.perceel }),
    energielabel: row.energielabel,
    kenmerken: row.kenmerken,
  };
}

function auditEvent(
  action: string,
  entityType: string,
  entityId: string | undefined,
  metadata: Record<string, unknown>,
  actorId?: string,
): AuditEventRecord {
  return {
    eventId: randomUUID(),
    action,
    entityType,
    ...(entityId ? { entityId } : {}),
    ...(actorId ? { actorId } : {}),
    metadata,
    at: new Date().toISOString(),
  };
}

type AuditExecutor = Pick<NonNullable<typeof db>, "insert">;

async function recordAudit(
  event: AuditEventRecord,
  transaction?: AuditExecutor,
): Promise<void> {
  if (postgresEnabled) {
    const database = transaction ?? requirePostgres();
    await database.insert(auditEventsTable).values({
      eventId: event.eventId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      actorId: event.actorId,
      metadata: event.metadata,
      createdAt: new Date(event.at),
    });
    return;
  }

  const events = readJson<AuditEventRecord[]>("audit.json", []);
  events.push(event);
  writeJson("audit.json", events);
}

export function initialiseRealEstateStorage(): Promise<void> {
  if (!initialisationPromise) {
    initialisationPromise = (async () => {
      if (postgresEnabled) {
        await requirePostgres().execute(sql`select 1`);
        return;
      }

      ensureStorage();
      await loadProperties();
      readJson("valuations.json", {});
      readJson("rentals.json", {});
      readJson("mortgages.json", {});
      readJson("market.json", defaultMarket);
      readJson("audit.json", []);
    })().catch((error: unknown) => {
      initialisationPromise = undefined;
      throw error;
    });
  }
  return initialisationPromise;
}

export async function loadProperties(): Promise<Record<string, PropertyRecord>> {
  if (postgresEnabled) {
    const rows = await requirePostgres().select().from(propertiesTable);
    return Object.fromEntries(rows.map((row) => [row.propertyId, propertyFromRow(row)]));
  }
  return readJson("properties.json", initialProperties);
}

export async function getProperty(
  propertyId: string,
): Promise<PropertyRecord | undefined> {
  if (postgresEnabled) {
    const [row] = await requirePostgres()
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.propertyId, propertyId))
      .limit(1);
    return row ? propertyFromRow(row) : undefined;
  }
  return (await loadProperties())[propertyId];
}

export async function createProperty(
  property: PropertyRecord,
  actorId?: string,
): Promise<PropertyRecord> {
  if (postgresEnabled) {
    const database = requirePostgres();
    const created = await database.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(propertiesTable)
        .values({
          propertyId: property.propertyId,
          adres: property.adres,
          type: property.type,
          bouwjaar: property.bouwjaar,
          woonoppervlak: property.woonoppervlak,
          perceel: property.perceel,
          energielabel: property.energielabel,
          kenmerken: property.kenmerken ?? {},
        })
        .returning();
      await recordAudit(
        auditEvent("property.created", "property", property.propertyId, { property }, actorId),
        transaction,
      );
      return propertyFromRow(row);
    });
    await registerTrustMetadata({
      entityType: "property",
      entityId: created.propertyId,
      sourceClass: "CANONICAL",
      sourceBoundary: "property",
      content: created,
    });
    return created;
  }

  const properties = await loadProperties();
  properties[property.propertyId] = property;
  writeJson("properties.json", properties);
  await recordAudit(auditEvent("property.created", "property", property.propertyId, { property }, actorId));
  return property;
}

export async function updateProperty(
  propertyId: string,
  changes: Partial<Omit<PropertyRecord, "propertyId">>,
  actorId?: string,
): Promise<PropertyRecord | undefined> {
  if (postgresEnabled) {
    const database = requirePostgres();
    const updated = await database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(propertiesTable)
        .where(eq(propertiesTable.propertyId, propertyId))
        .limit(1);
      if (!existing) {
        return undefined;
      }
      const [row] = await transaction
        .update(propertiesTable)
        .set({
          ...changes,
          updatedAt: new Date(),
        })
        .where(eq(propertiesTable.propertyId, propertyId))
        .returning();
      await recordAudit(
        auditEvent("property.updated", "property", propertyId, { changes }, actorId),
        transaction,
      );
      return propertyFromRow(row);
    });
    if (updated) {
      await registerTrustMetadata({
        entityType: "property",
        entityId: updated.propertyId,
        sourceClass: "CANONICAL",
        sourceBoundary: "property",
        content: updated,
      });
    }
    return updated;
  }

  const properties = await loadProperties();
  const existing = properties[propertyId];
  if (!existing) {
    return undefined;
  }
  const updated = { ...existing, ...changes };
  properties[propertyId] = updated;
  writeJson("properties.json", properties);
  await recordAudit(auditEvent("property.updated", "property", propertyId, { changes }, actorId));
  return updated;
}

export async function deleteProperty(
  propertyId: string,
  actorId?: string,
): Promise<boolean> {
  if (postgresEnabled) {
    const database = requirePostgres();
    return database.transaction(async (transaction) => {
      const deleted = await transaction
        .delete(propertiesTable)
        .where(eq(propertiesTable.propertyId, propertyId))
        .returning({ propertyId: propertiesTable.propertyId });
      if (!deleted.length) {
        return false;
      }
      await recordAudit(
        auditEvent("property.deleted", "property", propertyId, {}, actorId),
        transaction,
      );
      return true;
    });
  }

  const properties = await loadProperties();
  if (!properties[propertyId]) {
    return false;
  }
  delete properties[propertyId];
  writeJson("properties.json", properties);
  await recordAudit(auditEvent("property.deleted", "property", propertyId, {}, actorId));
  return true;
}

export async function saveProperties(
  properties: Record<string, PropertyRecord>,
): Promise<void> {
  if (postgresEnabled) {
    const database = requirePostgres();
    await database.transaction(async (transaction) => {
      for (const property of Object.values(properties)) {
        await transaction
          .insert(propertiesTable)
          .values({
            ...property,
            kenmerken: property.kenmerken ?? {},
          })
          .onConflictDoUpdate({
            target: propertiesTable.propertyId,
            set: {
              adres: property.adres,
              type: property.type,
              bouwjaar: property.bouwjaar,
              woonoppervlak: property.woonoppervlak,
              perceel: property.perceel,
              energielabel: property.energielabel,
              kenmerken: property.kenmerken ?? {},
              updatedAt: new Date(),
            },
          });
      }
    });
    return;
  }
  writeJson("properties.json", properties);
}

function moduleParts(filename: string): { moduleName: string; dataKey: string } {
  const basename = path.basename(filename, ".json");
  if (basename === "properties") {
    return { moduleName: "RealEstateX", dataKey: "properties" };
  }
  if (basename === "chatBoxX") {
    return { moduleName: "ChatBoxX", dataKey: "sessions" };
  }
  if (basename === "coreX") {
    return { moduleName: "CoreX", dataKey: "default" };
  }
  return { moduleName: "RealEstateX", dataKey: basename };
}

export async function readModuleData<T>(
  filename: string,
  fallback: T,
): Promise<T> {
  const { moduleName, dataKey } = moduleParts(filename);
  if (postgresEnabled) {
    const [row] = await requirePostgres()
      .select({ data: moduleDataTable.data })
      .from(moduleDataTable)
      .where(
        sql`${moduleDataTable.moduleName} = ${moduleName} and ${moduleDataTable.dataKey} = ${dataKey}`,
      )
      .limit(1);
    return (row?.data as T | undefined) ?? fallback;
  }
  return readJson(filename, fallback);
}

export async function writeModuleData<T>(
  filename: string,
  data: T,
): Promise<void> {
  const { moduleName, dataKey } = moduleParts(filename);
  if (postgresEnabled) {
    await requirePostgres()
      .insert(moduleDataTable)
      .values({
        moduleName,
        dataKey,
        data,
        sourceFile: filename,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [moduleDataTable.moduleName, moduleDataTable.dataKey],
        set: { data, sourceFile: filename, updatedAt: new Date() },
      });
    await registerTrustMetadata({
      entityType: "module_data",
      entityId: `${moduleName}:${dataKey}`,
      sourceClass: "CANONICAL",
      sourceBoundary: `module:${moduleName}`,
      sourceReference: filename,
      content: data,
    });
    return;
  }
  writeJson(filename, data);
}

export async function createChatSession(
  session: ChatSessionRecord,
): Promise<void> {
  if (postgresEnabled) {
    await requirePostgres()
      .insert(chatSessionsTable)
      .values({
        sessionId: session.sessionId,
        userId: session.userId,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.createdAt),
      })
      .onConflictDoNothing();
    await recordAudit(
      auditEvent("chat.created", "chat_session", session.sessionId, {
        userId: session.userId,
      }),
    );
    return;
  }
  const sessions = await readModuleData<Record<string, ChatSessionRecord>>(
    "chatBoxX.json",
    {},
  );
  sessions[session.sessionId] = session;
  await writeModuleData("chatBoxX.json", sessions);
  await recordAudit(auditEvent("chat.created", "chat_session", session.sessionId, {
    userId: session.userId,
  }));
}

export async function getChatSession(
  sessionId: string,
): Promise<ChatSessionRecord | undefined> {
  if (postgresEnabled) {
    const [session] = await requirePostgres()
      .select()
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.sessionId, sessionId))
      .limit(1);
    if (!session) {
      return undefined;
    }
    const messages = await requirePostgres()
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sessionId, sessionId))
      .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.messageId));
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      createdAt: session.createdAt.toISOString(),
      messages: messages.map((message) => ({
        role: message.role as ChatMessageRecord["role"],
        content: message.content,
        at: message.createdAt.toISOString(),
      })),
    };
  }
  const sessions = await readModuleData<Record<string, ChatSessionRecord>>(
    "chatBoxX.json",
    {},
  );
  return sessions[sessionId];
}

export async function appendChatMessages(
  sessionId: string,
  messages: ChatMessageRecord[],
): Promise<ChatSessionRecord | undefined> {
  if (postgresEnabled) {
    const database = requirePostgres();
    return database.transaction(async (transaction) => {
      const [session] = await transaction
        .select()
        .from(chatSessionsTable)
        .where(eq(chatSessionsTable.sessionId, sessionId))
        .limit(1);
      if (!session) {
        return undefined;
      }
      const createdAt = new Date();
      await transaction.insert(chatMessagesTable).values(
        messages.map((message, index) => ({
          messageId: `${sessionId}:${createdAt.getTime()}:${index}:${randomUUID()}`,
          sessionId,
          role: message.role,
          content: message.content,
          createdAt: new Date(message.at),
        })),
      );
      await transaction
        .update(chatSessionsTable)
        .set({ updatedAt: createdAt })
        .where(eq(chatSessionsTable.sessionId, sessionId));
      await recordAudit(
        auditEvent("chat.message_added", "chat_session", sessionId, {
          messageCount: messages.length,
        }),
        transaction,
      );
      const currentMessages = await transaction
        .select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.sessionId, sessionId))
        .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.messageId));
      return {
        sessionId,
        userId: session.userId,
        createdAt: session.createdAt.toISOString(),
        messages: currentMessages.map((message) => ({
          role: message.role as ChatMessageRecord["role"],
          content: message.content,
          at: message.createdAt.toISOString(),
        })),
      };
    });
  }

  const session = await getChatSession(sessionId);
  if (!session) {
    return undefined;
  }
  session.messages.push(...messages);
  const sessions = await readModuleData<Record<string, ChatSessionRecord>>(
    "chatBoxX.json",
    {},
  );
  sessions[sessionId] = session;
  await writeModuleData("chatBoxX.json", sessions);
  await recordAudit(auditEvent("chat.message_added", "chat_session", sessionId, {
    messageCount: messages.length,
  }));
  return session;
}