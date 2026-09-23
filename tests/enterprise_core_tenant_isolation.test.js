import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  db,
  requireDb,
  sessionsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import {
  coreRuntimeStateTable,
  recoveryPointsTable,
  trustMetadataTable,
} from "@workspace/db/schema";
import app from "../artifacts/api-server/src/app.ts";

const { pool } = requireDb();
const database = db;
const tenantA = randomUUID();
const tenantB = randomUUID();
const userA = `enterprise-core-tenant-a-${randomUUID()}`;
const userB = `enterprise-core-tenant-b-${randomUUID()}`;
const sessionA = randomUUID();
const sessionB = randomUUID();
const entityType = "tenant-isolation-test";
const entityId = randomUUID();
let server;

async function request(path, sid, init = {}) {
  return fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie: `sid=${sid}`,
    },
  });
}

before(async () => {
  await database.insert(tenantsTable).values([
    { id: tenantA, name: "Enterprise Core tenant A", isPersonal: false },
    { id: tenantB, name: "Enterprise Core tenant B", isPersonal: false },
  ]);
  await database.insert(usersTable).values([
    { id: userA, role: "admin", tenantId: tenantA },
    { id: userB, role: "admin", tenantId: tenantB },
  ]);
  await database.insert(sessionsTable).values([
    {
      sid: sessionA,
      sess: { user: { id: userA, role: "admin" }, access_token: "test" },
      expire: new Date(Date.now() + 60_000),
    },
    {
      sid: sessionB,
      sess: { user: { id: userB, role: "admin" }, access_token: "test" },
      expire: new Date(Date.now() + 60_000),
    },
  ]);
  await database.insert(trustMetadataTable).values([
    {
      tenantId: tenantA,
      entityType,
      entityId,
      sourceClass: "CANONICAL",
      sourceBoundary: "tenant-a",
      metadata: { tenant: "a" },
    },
    {
      tenantId: tenantB,
      entityType,
      entityId,
      sourceClass: "CANONICAL",
      sourceBoundary: "tenant-b",
      metadata: { tenant: "b" },
    },
  ]);
  await database.insert(coreRuntimeStateTable).values({
    tenantId: tenantB,
    stateId: "global",
    mode: "RECOVERY",
    reason: "tenant isolation test",
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await database
    .delete(recoveryPointsTable)
    .where(eq(recoveryPointsTable.tenantId, tenantA));
  await database
    .delete(coreRuntimeStateTable)
    .where(eq(coreRuntimeStateTable.tenantId, tenantB));
  await database
    .delete(trustMetadataTable)
    .where(
      and(
        eq(trustMetadataTable.entityType, entityType),
        eq(trustMetadataTable.entityId, entityId),
      ),
    );
  await database.delete(sessionsTable).where(eq(sessionsTable.sid, sessionA));
  await database.delete(sessionsTable).where(eq(sessionsTable.sid, sessionB));
  await database.delete(usersTable).where(eq(usersTable.id, userA));
  await database.delete(usersTable).where(eq(usersTable.id, userB));
  await database.delete(tenantsTable).where(eq(tenantsTable.id, tenantA));
  await database.delete(tenantsTable).where(eq(tenantsTable.id, tenantB));
  await pool.end();
});

test("core API isolates trust, audit, recovery points, and runtime state by tenant", async () => {
  const trustA = await request(
    `/api/core/trust/${entityType}/${entityId}`,
    sessionA,
  );
  assert.equal(trustA.status, 200);
  assert.deepEqual((await trustA.json()).metadata, { tenant: "a" });

  const trustB = await request(
    `/api/core/trust/${entityType}/${entityId}`,
    sessionB,
  );
  assert.equal(trustB.status, 200);
  assert.deepEqual((await trustB.json()).metadata, { tenant: "b" });

  const auditA = await request("/api/core/audit", sessionA);
  assert.equal(auditA.status, 200);
  for (const event of await auditA.json()) {
    assert.equal(event.tenantId, tenantA);
  }

  const auditB = await request("/api/core/audit", sessionB);
  assert.equal(auditB.status, 200);
  for (const event of await auditB.json()) {
    assert.equal(event.tenantId, tenantB);
  }

  const statusA = await request("/api/core/recovery/status", sessionA);
  assert.equal(statusA.status, 200);
  assert.equal((await statusA.json()).mode, "NORMAL");

  const statusB = await request("/api/core/recovery/status", sessionB);
  assert.equal(statusB.status, 200);
  assert.equal((await statusB.json()).mode, "RECOVERY");

  const recoveryPoint = await request("/api/core/recovery/points", sessionA, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "BACKUP", label: "tenant A" }),
  });
  assert.equal(recoveryPoint.status, 201);
  assert.equal((await recoveryPoint.json()).tenantId, tenantA);

  const recoveryRowsForB = await database
    .select()
    .from(recoveryPointsTable)
    .where(eq(recoveryPointsTable.tenantId, tenantB));
  assert.equal(recoveryRowsForB.length, 0);
});