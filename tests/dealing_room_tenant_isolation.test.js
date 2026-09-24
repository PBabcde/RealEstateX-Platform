import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express from "express";
import { requireDb } from "@workspace/db";
import dealsRouter from "../artifacts/api-server/src/routes/deals.ts";
import investorsRouter from "../artifacts/api-server/src/routes/investors.ts";
import crmRouter from "../artifacts/api-server/src/routes/crm.ts";
import enterpriseRouter from "../artifacts/api-server/src/routes/enterprise.ts";

const { pool } = requireDb();
let server;

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await pool.end();
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

async function request(baseUrl, token, path, method = "GET") {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: token ? { authorization: token } : {},
  });
}

async function seedModuleData(tenantId, dataKey, value) {
  await pool.query(
    `INSERT INTO module_data (tenant_id, module_name, data_key, data, source_file)
     VALUES ($1, 'EnterpriseModulesX', $2, $3::jsonb, 'tenant-isolation-test.json')`,
    [tenantId, dataKey, JSON.stringify(value)],
  );
}

test("authenticated Dealing Room, Investor Room and CRM routes cannot cross tenants", async () => {
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

  try {
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

    for (const path of ["/deals", "/investors", "/crm/contacts"]) {
      assert.equal((await request(baseUrl, undefined, path)).status, 401, `${path} requires auth`);
    }

    const dealsA = await (await request(baseUrl, "Bearer tenant-test-a", `/deals?tenantId=${tenantB}`)).json();
    const dealsB = await (await request(baseUrl, "Bearer tenant-test-b", "/deals")).json();
    assert.deepEqual(dealsA.map((deal) => deal.dealId), [dealAId]);
    assert.deepEqual(dealsB.map((deal) => deal.dealId), [dealBId]);
    assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/deals/${dealBId}`)).status, 404);
    assert.equal((await request(baseUrl, "Bearer tenant-test-b", `/deals/${dealAId}`)).status, 404);
    assert.equal((await request(baseUrl, "Bearer tenant-test-a", `/deals/${dealAId}/score`, "POST")).status, 200);
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
  } finally {
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
      server = undefined;
    }
    await pool.query(
      `DELETE FROM module_data WHERE tenant_id = ANY($1::uuid[])`,
      [[tenantA, tenantB]],
    );
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  }
});