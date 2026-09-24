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
import { moduleDataTable } from "@workspace/db/schema";
import app from "../artifacts/api-server/src/app.ts";

const { pool } = requireDb();
const database = db;
const tenantA = randomUUID();
const tenantB = randomUUID();
const userA = `intelligence-tenant-a-${randomUUID()}`;
const userB = `intelligence-tenant-b-${randomUUID()}`;
const sessionA = randomUUID();
const sessionB = randomUUID();
const eventIdA = randomUUID();
const eventIdB = randomUUID();
const scenarioIdA = randomUUID();
const scenarioIdB = randomUUID();
const visitorIdA = `visitor-a-${randomUUID()}`;
const visitorIdB = `visitor-b-${randomUUID()}`;
const moduleName = "EnterpriseModulesX";
let server;

async function request(path, sid) {
  return fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    headers: { cookie: `sid=${sid}` },
  });
}

before(async () => {
  await database.insert(tenantsTable).values([
    { id: tenantA, name: "Training and intelligence tenant A", isPersonal: false },
    { id: tenantB, name: "Training and intelligence tenant B", isPersonal: false },
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
  const occurredAt = new Date().toISOString();
  await database.insert(moduleDataTable).values([
    {
      tenantId: tenantA,
      moduleName,
      dataKey: `training-scenario:${scenarioIdA}`,
      data: {
        scenarioId: scenarioIdA,
        title: "Tenant A training scenario",
        updatedAt: occurredAt,
        ownerId: userA,
      },
      sourceFile: "training-scenario.json",
      updatedAt: new Date(),
    },
    {
      tenantId: tenantB,
      moduleName,
      dataKey: `training-scenario:${scenarioIdB}`,
      data: {
        scenarioId: scenarioIdB,
        title: "Tenant B training scenario",
        updatedAt: occurredAt,
        ownerId: userB,
      },
      sourceFile: "training-scenario.json",
      updatedAt: new Date(),
    },
    {
      tenantId: tenantA,
      moduleName,
      dataKey: `visitor-intent-event:${eventIdA}`,
      data: {
        eventId: eventIdA,
        visitorId: visitorIdA,
        eventType: "DEAL_VIEW",
        dealId: `deal-${randomUUID()}`,
        occurredAt,
        consent: true,
        consentAt: occurredAt,
        actorId: userA,
      },
      sourceFile: "visitor-intent-event.json",
      updatedAt: new Date(),
    },
    {
      tenantId: tenantB,
      moduleName,
      dataKey: `visitor-intent-event:${eventIdB}`,
      data: {
        eventId: eventIdB,
        visitorId: visitorIdB,
        eventType: "DEAL_VIEW",
        dealId: `deal-${randomUUID()}`,
        occurredAt,
        consent: true,
        consentAt: occurredAt,
        actorId: userB,
      },
      sourceFile: "visitor-intent-event.json",
      updatedAt: new Date(),
    },
  ]);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await database
    .delete(moduleDataTable)
    .where(
      and(
        eq(moduleDataTable.tenantId, tenantA),
        eq(moduleDataTable.moduleName, moduleName),
      ),
    );
  await database
    .delete(moduleDataTable)
    .where(
      and(
        eq(moduleDataTable.tenantId, tenantB),
        eq(moduleDataTable.moduleName, moduleName),
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

test("training scenarios and visitor summaries remain isolated by tenant", async () => {
  const trainingA = await request("/api/training/scenarios", sessionA);
  const trainingB = await request("/api/training/scenarios", sessionB);
  const responseA = await request("/api/visitor-intent/summary?days=30", sessionA);
  const responseB = await request("/api/visitor-intent/summary?days=30", sessionB);
  assert.equal(trainingA.status, 200);
  assert.equal(trainingB.status, 200);
  assert.equal(responseA.status, 200);
  assert.equal(responseB.status, 200);

  assert.deepEqual(
    (await trainingA.json()).map((scenario) => scenario.scenarioId),
    [scenarioIdA],
  );
  assert.deepEqual(
    (await trainingB.json()).map((scenario) => scenario.scenarioId),
    [scenarioIdB],
  );
  const summaryA = await responseA.json();
  const summaryB = await responseB.json();
  assert.equal(summaryA.uniqueVisitors, 1);
  assert.equal(summaryB.uniqueVisitors, 1);
  assert.deepEqual(
    summaryA.leads.map((lead) => lead.visitorId),
    [visitorIdA],
  );
  assert.deepEqual(
    summaryB.leads.map((lead) => lead.visitorId),
    [visitorIdB],
  );
});