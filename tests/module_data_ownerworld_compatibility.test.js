import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  db,
  DEFAULT_TENANT_ID,
  moduleDataTable,
  requireDb,
} from "@workspace/db";
import { readModuleData } from "../artifacts/api-server/src/lib/realestatex-storage.ts";

const { pool } = requireDb();
const database = db;
const filename = "ownerworld-compatibility-test.json";
const dataKey = "ownerworld-compatibility-test";

after(async () => {
  await database
    .delete(moduleDataTable)
    .where(
      and(
        eq(moduleDataTable.tenantId, DEFAULT_TENANT_ID),
        eq(moduleDataTable.moduleName, "RealEstateX"),
        eq(moduleDataTable.dataKey, dataKey),
      ),
    );
  await pool.end();
});

test("legacy module data remains available to ownerworld after migration", async () => {
  await database.insert(moduleDataTable).values({
    moduleName: "RealEstateX",
    dataKey,
    data: { source: "legacy", available: true },
    sourceFile: filename,
  });

  const data = await readModuleData(filename, {}, DEFAULT_TENANT_ID);
  assert.deepEqual(data, { source: "legacy", available: true });
});