import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { db, hashAuditEvent, pool, sql } from "@workspace/db";
import {
  DEFAULT_TENANT_ID,
  auditEventsTable,
  chatMessagesTable,
  chatSessionsTable,
  moduleDataTable,
  propertiesTable,
} from "@workspace/db/schema";

type JsonObject = Record<string, unknown>;

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const storagePath = path.resolve(
  process.env.REALESTATEX_STORAGE_PATH ?? path.join(workspaceRoot, "storage", "realestateX"),
);

function requireDatabase() {
  if (!db) {
    throw new Error("DATABASE_URL is required for the RealEstateX JSON import.");
  }
  return db;
}

function readJson(filename: string): unknown {
  const target = path.join(storagePath, filename);
  if (!fs.existsSync(target)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Cannot import ${target}: invalid JSON`, { cause: error });
  }
}

function objectValue(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return value as JsonObject;
}

function stableId(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function moduleNameFor(filename: string): string {
  const basename = path.basename(filename, ".json");
  if (["valuations", "rentals", "mortgages", "market"].includes(basename)) {
    return "RealEstateX";
  }
  return basename;
}

function dataKeyFor(filename: string): string {
  const basename = path.basename(filename, ".json");
  if (basename === "chatBoxX") {
    return "sessions";
  }
  if (basename === "properties") {
    return "properties";
  }
  if (basename === "coreX") {
    return "default";
  }
  return basename;
}

function asDate(value: unknown): Date {
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date(0);
}

type AuditDatabase = Pick<
  NonNullable<typeof db>,
  "execute" | "insert" | "select"
>;

async function appendLegacyAuditEvent(
  database: AuditDatabase,
  input: {
    eventId: string;
    action: string;
    entityType: string;
    entityId?: string;
    actorId?: string;
    metadata: JsonObject;
    createdAt: Date;
  },
): Promise<void> {
  const metadataResult = await database.execute(
    sql`select ${JSON.stringify(input.metadata)}::jsonb::text as metadata_text`,
  );
  const [metadataRow] = metadataResult.rows as unknown as Array<{
    metadata_text: string;
  }>;
  if (!metadataRow?.metadata_text) {
    throw new Error("Could not canonicalize legacy audit metadata.");
  }
  const existing = await database
    .select({
      sequenceId: auditEventsTable.sequenceId,
      eventHash: auditEventsTable.eventHash,
    })
    .from(auditEventsTable)
    .where(sql`${auditEventsTable.tenantId} = ${DEFAULT_TENANT_ID}`);
  const previous = existing.reduce<typeof existing[number] | undefined>(
    (current, candidate) =>
      !current || candidate.sequenceId > current.sequenceId ? candidate : current,
    undefined,
  );
  const sequenceId = (previous?.sequenceId ?? 0) + 1;
  const previousHash = previous?.eventHash ?? null;
  await database.insert(auditEventsTable).values({
    eventId: input.eventId,
    tenantId: DEFAULT_TENANT_ID,
    sequenceId,
    previousHash,
    eventHash: hashAuditEvent({
      sequenceId,
      previousHash,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      actorId: input.actorId ?? null,
      metadataText: metadataRow.metadata_text,
      createdAt: input.createdAt,
    }),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: input.actorId,
    metadata: input.metadata,
    createdAt: input.createdAt,
  });
}

async function migrate(): Promise<void> {
  const database = requireDatabase();
  const properties = objectValue(readJson("properties.json") ?? {}, "properties.json");
  const filenames = fs.existsSync(storagePath)
    ? fs.readdirSync(storagePath).filter((filename) => filename.endsWith(".json")).sort()
    : [];

  await database.transaction(async (transaction) => {
    for (const [propertyId, value] of Object.entries(properties)) {
      const property = objectValue(value, `properties.json:${propertyId}`);
      await transaction
        .insert(propertiesTable)
        .values({
          propertyId,
          ownerId: String(property.ownerId ?? "legacy"),
          adres: String(property.adres ?? ""),
          type: String(property.type ?? ""),
          bouwjaar: Number(property.bouwjaar ?? 0),
          woonoppervlak: Number(property.woonoppervlak ?? 0),
          perceel: property.perceel == null ? null : Number(property.perceel),
          energielabel: String(property.energielabel ?? ""),
          kenmerken: objectValue(property.kenmerken ?? {}, `${propertyId}.kenmerken`) as Record<string, string>,
        })
        .onConflictDoUpdate({
          target: propertiesTable.propertyId,
          set: {
            ownerId: String(property.ownerId ?? "legacy"),
            adres: String(property.adres ?? ""),
            type: String(property.type ?? ""),
            bouwjaar: Number(property.bouwjaar ?? 0),
            woonoppervlak: Number(property.woonoppervlak ?? 0),
            perceel: property.perceel == null ? null : Number(property.perceel),
            energielabel: String(property.energielabel ?? ""),
            kenmerken: objectValue(property.kenmerken ?? {}, `${propertyId}.kenmerken`) as Record<string, string>,
            updatedAt: new Date(),
          },
        });
    }

    for (const filename of filenames) {
      if (filename === "properties.json") {
        continue;
      }
      const data = readJson(filename);
      if (data === undefined) {
        continue;
      }
      await transaction
        .insert(moduleDataTable)
        .values({
          tenantId: DEFAULT_TENANT_ID,
          moduleName: moduleNameFor(filename),
          dataKey: dataKeyFor(filename),
          data,
          sourceFile: filename,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            moduleDataTable.tenantId,
            moduleDataTable.moduleName,
            moduleDataTable.dataKey,
          ],
          set: { data, sourceFile: filename, updatedAt: new Date() },
        });
    }

    const chatData = objectValue(readJson("chatBoxX.json") ?? {}, "chatBoxX.json");
    for (const [sessionId, value] of Object.entries(chatData)) {
      const session = objectValue(value, `chatBoxX.json:${sessionId}`);
      const createdAt = asDate(session.createdAt);
      await transaction
        .insert(chatSessionsTable)
        .values({
          sessionId,
          userId: String(session.userId ?? "default"),
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing();

      const messages = Array.isArray(session.messages) ? session.messages : [];
      for (const [index, value] of messages.entries()) {
        const message = objectValue(value, `${sessionId}.messages[${index}]`);
        const role = message.role === "assistant" ? "assistant" : "user";
        await transaction
          .insert(chatMessagesTable)
          .values({
            messageId: stableId(`${sessionId}:${index}:${String(message.at ?? "")}:${String(message.content ?? "")}`),
            sessionId,
            role,
            content: String(message.content ?? ""),
            createdAt: asDate(message.at),
          })
          .onConflictDoNothing();
      }
    }

    const core = objectValue(readJson("coreX.json") ?? {}, "coreX.json");
    const audit = Array.isArray(core.audit) ? core.audit : [];
    for (const [index, value] of audit.entries()) {
      const event = objectValue(value, `coreX.audit[${index}]`);
      await appendLegacyAuditEvent(transaction, {
          eventId: stableId(`coreX.audit:${index}:${JSON.stringify(event)}`),
          action: String(event.action ?? "legacy.audit"),
          entityType: String(event.entityType ?? "legacy"),
          ...(event.entityId == null ? {} : { entityId: String(event.entityId) }),
          ...(event.actorId == null ? {} : { actorId: String(event.actorId) }),
          metadata: event,
          createdAt: asDate(event.at ?? event.createdAt),
      });
    }
  });

  console.log(
    `Imported ${Object.keys(properties).length} properties and ${filenames.length} JSON module files into PostgreSQL.`,
  );
}

migrate()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end();
  });