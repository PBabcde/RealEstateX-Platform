import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  moduleDataTable,
  requireDb,
  tenantsTable,
  trustMetadataTable,
} from "@workspace/db";
import {
  ingestDocument,
  retrieveDocuments,
} from "../artifacts/api-server/src/lib/rag-storage.ts";

const { pool } = requireDb();
const database = db;
const tenantA = randomUUID();
const tenantB = randomUUID();
const ownerId = `rag-tenant-isolation-${randomUUID()}`;

after(async () => {
  await database
    .delete(moduleDataTable)
    .where(and(eq(moduleDataTable.tenantId, tenantA), eq(moduleDataTable.moduleName, "RealEstateX")));
  await database
    .delete(moduleDataTable)
    .where(and(eq(moduleDataTable.tenantId, tenantB), eq(moduleDataTable.moduleName, "RealEstateX")));
  await database
    .delete(trustMetadataTable)
    .where(
      and(
        eq(trustMetadataTable.tenantId, tenantA),
        eq(trustMetadataTable.entityType, "module_data"),
      ),
    );
  await database
    .delete(trustMetadataTable)
    .where(
      and(
        eq(trustMetadataTable.tenantId, tenantB),
        eq(trustMetadataTable.entityType, "module_data"),
      ),
    );
  await database.delete(tenantsTable).where(eq(tenantsTable.id, tenantA));
  await database.delete(tenantsTable).where(eq(tenantsTable.id, tenantB));
  await pool.end();
});

test("RAG retrieval never crosses tenant boundaries for the same owner", async () => {
  await database.insert(tenantsTable).values([
    { id: tenantA, name: "RAG isolation A", isPersonal: false },
    { id: tenantB, name: "RAG isolation B", isPersonal: false },
  ]);

  const documentA = await ingestDocument({
    ownerId,
    tenantId: tenantA,
    filename: "tenant-a.txt",
    content: "Confidential albatross guidance for tenant A.",
  });
  const documentB = await ingestDocument({
    ownerId,
    tenantId: tenantB,
    filename: "tenant-b.txt",
    content: "Confidential boron guidance for tenant B.",
  });

  const resultsA = await retrieveDocuments(ownerId, "albatross", tenantA);
  const resultsB = await retrieveDocuments(ownerId, "boron", tenantB);
  assert.equal(resultsA[0]?.documentId, documentA.documentId);
  assert.equal(resultsB[0]?.documentId, documentB.documentId);
  assert.deepEqual(await retrieveDocuments(ownerId, "boron", tenantA), []);
  assert.deepEqual(await retrieveDocuments(ownerId, "albatross", tenantB), []);
});