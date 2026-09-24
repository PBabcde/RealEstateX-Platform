import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express from "express";

const testDatabaseName = process.env.DEALING_ROOM_TEST_DATABASE;
const configuredDatabaseName = process.env.DATABASE_URL
  ? decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1))
  : undefined;

if (
  !testDatabaseName ||
  !/^dealing_room_isolation_[a-f0-9]{32}$/.test(testDatabaseName) ||
  configuredDatabaseName !== testDatabaseName
) {
  throw new Error(
    "Run this test through `pnpm --filter @workspace/scripts run test:dealing-room-tenant-isolation`; it only accepts its disposable database.",
  );
}

let pool;
let server;
let dealsRouter;
let investorsRouter;
let crmRouter;
let enterpriseRouter;

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  if (pool) await pool.end();
});

function makeDeal(dealId, ownerId, title) {
  const now = new Date().toISOString();
  return {
    dealId,
    propertyId: `fixture-property-${dealId}`,
    title,
    region: "Amsterdam",
    propertyType: "Appartement",
    energyLabel: "C",
    woonoppervlak: 80,
    askingPrice: 300000,
    renovationCost: 10000,
    expectedValue: 350000,
    monthlyRent: 1500,
    status: "REVIEW",
    ownerId,
    score: { totalScore: 80, decision: "GO", breakdown: [] },
    createdAt: now,
    updatedAt: now,
  };
}

function makeInvestor(investorId, ownerId, name) {
  const now = new Date().toISOString();
  return {
    investorId,
    name,
    email: `${investorId}@example.test`,
    riskProfile: "MEDIUM",
    budgetMin: 200000,
    budgetMax: 500000,
    preferredRegions: ["Amsterdam"],
    interests: ["Appartement"],
    ownerId,
    createdAt: now,
    updatedAt: now,
  };
}

function makeContact(contactId, ownerId, name) {
  const now = new Date().toISOString();
  return {
    contactId,
    type: "PARTNER",
    name,
    email: `${contactId}@example.test`,
    status: "ACTIVE",
    ownerId,
    createdAt: now,
    updatedAt: now,
  };
}

async function request(baseUrl, token, path, { method = "GET", body } = {}) {
  const headers = token ? { authorization: token } : {};
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function seedModuleData(tenantId, dataKey, value) {
  await pool.query(
    `INSERT INTO module_data (tenant_id, module_name, data_key, data, source_file)
     VALUES ($1, 'EnterpriseModulesX', $2, $3::jsonb, 'tenant-isolation-test.json')`,
    [tenantId, dataKey, JSON.stringify(value)],
  );
}

async function getStoredRows(dataKey) {
  const result = await pool.query(
    `SELECT tenant_id, data
     FROM module_data
     WHERE module_name = 'EnterpriseModulesX' AND data_key = $1`,
    [dataKey],
  );
  return result.rows;
}

test("authenticated deal and CRM mutations remain inside the server-selected tenant", async () => {
  const [databaseModule, dealsModule, investorsModule, crmModule, enterpriseModule] =
    await Promise.all([
      import("../lib/db/src/index.ts"),
      import("../artifacts/api-server/src/routes/deals.ts"),
      import("../artifacts/api-server/src/routes/investors.ts"),
      import("../artifacts/api-server/src/routes/crm.ts"),
      import("../artifacts/api-server/src/routes/enterprise.ts"),
    ]);
  pool = databaseModule.requireDb().pool;
  dealsRouter = dealsModule.default;
  investorsRouter = investorsModule.default;
  crmRouter = crmModule.default;
  enterpriseRouter = enterpriseModule.default;

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const ownerA = `tenant-test-owner-${randomUUID()}`;
  const ownerB = `tenant-test-owner-${randomUUID()}`;
  const dealAId = `deal-a-${randomUUID()}`;
  const dealBId = `deal-b-${randomUUID()}`;
  const investorAId = `investor-a-${randomUUID()}`;
  const investorBId = `investor-b-${randomUUID()}`;
  const contactAId = `contact-a-${randomUUID()}`;
  const contactBId = `contact-b-${randomUUID()}`;
  const activityAId = `activity-a-${randomUUID()}`;
  const activityBId = `activity-b-${randomUUID()}`;
  const propertyAId = `property-a-${randomUUID()}`;
  const principalByToken = new Map([
    ["Bearer tenant-test-a", { id: ownerA, tenantId: tenantA, role: "owner" }],
    ["Bearer tenant-test-b", { id: ownerB, tenantId: tenantB, role: "owner" }],
  ]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const principal = principalByToken.get(req.header("authorization"));
    req.isAuthenticated = () => Boolean(principal);
    if (principal) req.user = principal;
    next();
  });
  app.use("/api", dealsRouter, investorsRouter, crmRouter, enterpriseRouter);

  await pool.query(
    `INSERT INTO tenants (id, name, is_personal)
     VALUES ($1, 'Dealing Room test A', true), ($2, 'Dealing Room test B', true)`,
    [tenantA, tenantB],
  );

  const contactA = makeContact(contactAId, ownerA, "CRM tenant A");
  const contactB = makeContact(contactBId, ownerB, "CRM tenant B");
  const activityA = {
    activityId: activityAId,
    contactId: contactAId,
    kind: "NOTE",
    summary: "Private communication A",
    occurredAt: new Date().toISOString(),
    actorId: ownerA,
    ownerId: ownerA,
    createdAt: new Date().toISOString(),
  };
  const activityB = {
    ...activityA,
    activityId: activityBId,
    contactId: contactBId,
    summary: "Private communication B",
    actorId: ownerB,
    ownerId: ownerB,
  };

  await pool.query(
    `INSERT INTO properties
      (property_id, owner_id, adres, type, bouwjaar, woonoppervlak, energielabel, kenmerken)
     VALUES ($1, $2, 'Testlaan 1, Amsterdam', 'Appartement', 2000, 80, 'C', '{}'::jsonb)`,
    [propertyAId, ownerA],
  );

  await Promise.all([
    seedModuleData(tenantA, `deal:${dealAId}`, makeDeal(dealAId, ownerA, "Deal A")),
    seedModuleData(tenantB, `deal:${dealBId}`, makeDeal(dealBId, ownerB, "Deal B")),
    seedModuleData(tenantA, `investor:${investorAId}`, makeInvestor(investorAId, ownerA, "Investor A")),
    seedModuleData(tenantB, `investor:${investorBId}`, makeInvestor(investorBId, ownerB, "Investor B")),
    seedModuleData(tenantA, `crm-contact:${contactAId}`, contactA),
    seedModuleData(tenantB, `crm-contact:${contactBId}`, contactB),
    seedModuleData(tenantA, `crm-activity:${activityAId}`, activityA),
    seedModuleData(tenantB, `crm-activity:${activityBId}`, activityB),
  ]);

  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const tenantBQuery = `?tenantId=${tenantB}`;

  for (const path of ["/deals", "/investors", "/crm/contacts"]) {
    assert.equal((await request(baseUrl, undefined, path)).status, 401, `${path} requires auth`);
  }

  const dealsA = await (await request(baseUrl, "Bearer tenant-test-a", `/deals?tenantId=${tenantB}`)).json();
  const dealsB = await (await request(baseUrl, "Bearer tenant-test-b", "/deals")).json();
  assert.deepEqual(dealsA.map((deal) => deal.dealId), [dealAId]);
  assert.deepEqual(dealsB.map((deal) => deal.dealId), [dealBId]);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/deals/${dealBId}`)).status, 404);
  assert.equal((await request(baseUrl, "Bearer tenant-test-b", `/deals/${dealAId}`)).status, 404);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/deals/${dealAId}/score`, { method: "POST" })).status, 200);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/deals/${dealAId}/energy`)).status, 200);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/deals/${dealAId}/investor-ready-sheet`)).status, 200);
  const matchesA = await (await request(baseUrl, "Bearer tenant-test-a", `/deals/${dealAId}/matches`)).json();
  assert.equal(matchesA.some((match) => match.investorId === investorBId), false);

  const investorsA = await (await request(baseUrl, "Bearer tenant-test-a", "/investors")).json();
  const investorsB = await (await request(baseUrl, "Bearer tenant-test-b", "/investors")).json();
  assert.deepEqual(investorsA.map((investor) => investor.investorId), [investorAId]);
  assert.deepEqual(investorsB.map((investor) => investor.investorId), [investorBId]);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/investors/${investorBId}`)).status, 404);
  assert.equal((await request(baseUrl, "Bearer tenant-test-b", `/investors/${investorAId}`)).status, 404);

  const contactsA = await (await request(baseUrl, "Bearer tenant-test-a", "/crm/contacts")).json();
  const contactsB = await (await request(baseUrl, "Bearer tenant-test-b", "/crm/contacts")).json();
  assert.deepEqual(contactsA.map((contact) => contact.contactId), [contactAId]);
  assert.deepEqual(contactsB.map((contact) => contact.contactId), [contactBId]);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/crm/contacts/${contactBId}`)).status, 404);
  assert.equal((await request(baseUrl, "Bearer tenant-test-b", `/crm/contacts/${contactAId}`)).status, 404);

  const activitiesA = await (
    await request(baseUrl, "Bearer tenant-test-a", `/crm/contacts/${contactAId}/activities`)
  ).json();
  const activitiesB = await (
    await request(baseUrl, "Bearer tenant-test-b", `/crm/contacts/${contactBId}/activities`)
  ).json();
  assert.deepEqual(activitiesA.map((activity) => activity.activityId), [activityAId]);
  assert.deepEqual(activitiesB.map((activity) => activity.activityId), [activityBId]);
  assert.equal((await request(baseUrl, "Bearer tenant-test-b", `/crm/contacts/${contactAId}/activities`)).status, 404);

  const overviewA = await (await request(baseUrl, "Bearer tenant-test-a", "/enterprise/overview")).json();
  assert.equal(overviewA.counts.deals, 1);
  assert.equal(overviewA.counts.investors, 1);
  assert.equal(overviewA.counts.crmContacts, 1);

  const createDeal = await request(baseUrl, "Bearer tenant-test-a", `/deals${tenantBQuery}`, {
    method: "POST",
    body: {
      tenantId: tenantB,
      propertyId: propertyAId,
      title: "Created in tenant A",
      region: "Amsterdam",
      askingPrice: 300000,
      renovationCost: 10000,
      expectedValue: 350000,
      monthlyRent: 1500,
    },
  });
  assert.equal(createDeal.status, 201);
  const createdDeal = await createDeal.json();
  const dealKey = `deal:${createdDeal.dealId}`;
  let storedDealRows = await getStoredRows(dealKey);
  assert.deepEqual(storedDealRows.map((row) => row.tenant_id), [tenantA]);

  const patchDeal = await request(baseUrl, "Bearer tenant-test-a", `/deals/${createdDeal.dealId}${tenantBQuery}`, {
    method: "PATCH",
    body: { tenantId: tenantB, title: "Updated in tenant A" },
  });
  assert.equal(patchDeal.status, 200);
  assert.equal((await patchDeal.json()).title, "Updated in tenant A");
  storedDealRows = await getStoredRows(dealKey);
  assert.deepEqual(storedDealRows.map((row) => row.tenant_id), [tenantA]);
  assert.equal(storedDealRows[0].data.title, "Updated in tenant A");
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/deals/${dealBId}${tenantBQuery}`, {
    method: "PATCH",
    body: { tenantId: tenantA, title: "Must not change tenant B" },
  })).status, 404);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/deals/${dealBId}${tenantBQuery}`, {
    method: "DELETE",
    body: { tenantId: tenantB },
  })).status, 404);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/deals/${createdDeal.dealId}${tenantBQuery}`, {
    method: "DELETE",
    body: { tenantId: tenantB },
  })).status, 204);
  assert.deepEqual(await getStoredRows(dealKey), []);
  assert.equal((await getStoredRows(`deal:${dealBId}`))[0].data.title, "Deal B");

  const createInvestor = await request(baseUrl, "Bearer tenant-test-a", `/investors${tenantBQuery}`, {
    method: "POST",
    body: {
      tenantId: tenantB,
      name: "Created in tenant A",
      email: `created-${randomUUID()}@example.test`,
      riskProfile: "MEDIUM",
      budgetMin: 100000,
      budgetMax: 400000,
      preferredRegions: ["Amsterdam"],
      interests: ["Appartement"],
    },
  });
  assert.equal(createInvestor.status, 201);
  const createdInvestor = await createInvestor.json();
  const investorKey = `investor:${createdInvestor.investorId}`;
  assert.deepEqual((await getStoredRows(investorKey)).map((row) => row.tenant_id), [tenantA]);
  const patchInvestor = await request(
    baseUrl,
    "Bearer tenant-test-a",
    `/investors/${createdInvestor.investorId}${tenantBQuery}`,
    { method: "PATCH", body: { tenantId: tenantB, name: "Updated in tenant A" } },
  );
  assert.equal(patchInvestor.status, 200);
  assert.equal((await patchInvestor.json()).name, "Updated in tenant A");
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/investors/${investorBId}${tenantBQuery}`, {
    method: "PATCH",
    body: { tenantId: tenantA, name: "Must not change tenant B" },
  })).status, 404);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/investors/${investorBId}${tenantBQuery}`, {
    method: "DELETE",
    body: { tenantId: tenantB },
  })).status, 404);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/investors/${createdInvestor.investorId}${tenantBQuery}`, {
    method: "DELETE",
    body: { tenantId: tenantB },
  })).status, 204);
  assert.deepEqual(await getStoredRows(investorKey), []);
  assert.equal((await getStoredRows(`investor:${investorBId}`))[0].data.name, "Investor B");

  const createContact = await request(baseUrl, "Bearer tenant-test-a", `/crm/contacts${tenantBQuery}`, {
    method: "POST",
    body: {
      tenantId: tenantB,
      type: "PARTNER",
      name: "Created in tenant A",
      email: `created-${randomUUID()}@example.test`,
      status: "ACTIVE",
    },
  });
  assert.equal(createContact.status, 201);
  const createdContact = await createContact.json();
  const contactKey = `crm-contact:${createdContact.contactId}`;
  assert.deepEqual((await getStoredRows(contactKey)).map((row) => row.tenant_id), [tenantA]);
  const patchContact = await request(
    baseUrl,
    "Bearer tenant-test-a",
    `/crm/contacts/${createdContact.contactId}${tenantBQuery}`,
    { method: "PATCH", body: { tenantId: tenantB, name: "Updated in tenant A" } },
  );
  assert.equal(patchContact.status, 200);
  assert.equal((await patchContact.json()).name, "Updated in tenant A");
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/crm/contacts/${contactBId}${tenantBQuery}`, {
    method: "PATCH",
    body: { tenantId: tenantA, name: "Must not change tenant B" },
  })).status, 404);
  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/crm/contacts/${contactBId}${tenantBQuery}`, {
    method: "DELETE",
    body: { tenantId: tenantB },
  })).status, 404);

  const createActivity = await request(
    baseUrl,
    "Bearer tenant-test-a",
    `/crm/contacts/${createdContact.contactId}/activities${tenantBQuery}`,
    {
      method: "POST",
      body: {
        tenantId: tenantB,
        kind: "NOTE",
        summary: "Created in tenant A",
      },
    },
  );
  assert.equal(createActivity.status, 201);
  const createdActivity = await createActivity.json();
  const activityKey = `crm-activity:${createdActivity.activityId}`;
  const storedActivityRows = await getStoredRows(activityKey);
  assert.deepEqual(storedActivityRows.map((row) => row.tenant_id), [tenantA]);
  assert.equal(storedActivityRows[0].data.contactId, createdContact.contactId);
  assert.equal(storedActivityRows[0].data.actorId, ownerA);
  assert.equal((await request(
    baseUrl,
    "Bearer tenant-test-a",
    `/crm/contacts/${contactBId}/activities${tenantBQuery}`,
    { method: "POST", body: { tenantId: tenantA, summary: "Must not land in tenant B" } },
  )).status, 404);
  const activitiesBAfterMutation = await (
    await request(baseUrl, "Bearer tenant-test-b", `/crm/contacts/${contactBId}/activities`)
  ).json();
  assert.deepEqual(activitiesBAfterMutation.map((activity) => activity.activityId), [activityBId]);

  assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/crm/contacts/${createdContact.contactId}${tenantBQuery}`, {
    method: "DELETE",
    body: { tenantId: tenantB },
  })).status, 204);
  assert.deepEqual(await getStoredRows(contactKey), []);
  assert.equal((await getStoredRows(`crm-contact:${contactBId}`))[0].data.name, "CRM tenant B");

  const auditRows = await pool.query(
    `SELECT tenant_id, action
     FROM audit_events
     WHERE action LIKE 'enterprise.%'
     ORDER BY tenant_id, sequence_id`,
  );
  const tenantAAuditRows = auditRows.rows.filter((row) => row.tenant_id === tenantA);
  const tenantBAuditRows = auditRows.rows.filter((row) => row.tenant_id === tenantB);
  assert.equal(tenantAAuditRows.length, 10);
  assert.equal(tenantBAuditRows.length, 0);
  assert.equal(
    tenantAAuditRows.some((row) => row.action === "enterprise.crm-activity.created"),
    true,
  );
  const appendOnlyTrigger = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgrelid = 'audit_events'::regclass
         AND tgname = 'trg_enforce_audit_events_immutability'
         AND NOT tgisinternal
     ) AS installed`,
  );
  assert.equal(appendOnlyTrigger.rows[0].installed, true);
});