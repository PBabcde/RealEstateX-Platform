import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";

test("server recalculates legacy and forged approvals and keeps reports aligned", async () => {
  const name = process.env.DEALING_ROOM_TEST_DATABASE;
  if (!name || !/^dealing_room_isolation_[a-f0-9]{32}$/.test(name) ||
      decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)) !== name) {
    throw new Error("Only run through the disposable investment-policy API test runner.");
  }
  const [{requireDb}, {default: deals}, {default: training}] = await Promise.all([
    import("../lib/db/src/index.ts"),
    import("../artifacts/api-server/src/routes/deals.ts"),
    import("../artifacts/api-server/src/routes/training.ts"),
  ]);
  const {pool} = requireDb();
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const propertyId = randomUUID();
  let server;
  try {
    await pool.query("INSERT INTO tenants(id,name,is_personal) VALUES($1,'Policy test',true)", [tenantId]);
    await pool.query(`INSERT INTO properties(property_id,owner_id,adres,type,bouwjaar,woonoppervlak,energielabel,kenmerken)
      VALUES($1,$2,'Test Gorinchem','Appartement',2000,80,'A','{}'::jsonb)`, [propertyId, ownerId]);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.dbUser = {id: ownerId, tenantId, role: "owner"};
      next();
    });
    app.use("/api", deals, training);
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const call = (path, method = "GET", body) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: {"content-type": "application/json"}, ...(body ? {body: JSON.stringify(body)} : {}),
    });
    const assumptions = { acquisitionCosts: 10000, heatPumpCosts: 9000, pvCosts: 6000,
      heatPumpKw: 5, glassGlassPv: true, vacancyPercent: 10, annualOperatingCosts: 3000,
      region: "gorinchem", radiusKm: 60, distanceKm: 42 };
    const input = {propertyId, title: "Policy scenario", region: "Gorinchem", askingPrice: 100000,
      renovationCost: 10000, expectedValue: 500000, monthlyRent: 1000};
    const legacy = await call("/deals", "POST", input);
    assert.equal(legacy.status, 201);
    const legacyDeal = await legacy.json();
    assert.notEqual(legacyDeal.score.decision, "GO");
    assert.equal(legacyDeal.score.assessment.eligible, false);
    const corrected = await call(`/deals/${legacyDeal.dealId}`, "PATCH", {investmentAssumptions: assumptions});
    assert.equal(corrected.status, 200);
    const correctedDeal = await corrected.json();
    assert.equal(correctedDeal.monthlyRent, 1000);
    assert.equal(correctedDeal.score.assessment.eligible, true);
    assert.equal(correctedDeal.score.assessment.totalInvestment, 135000);
    const invalid = await call(`/deals/${legacyDeal.dealId}`, "PATCH", {investmentAssumptions: {...assumptions, radiusKm: 70}});
    assert.equal(invalid.status, 400);
    const created = await call("/training/scenarios", "POST", {...input, investmentAssumptions: assumptions});
    assert.equal(created.status, 201);
    const scenario = await created.json();
    assert.equal(scenario.qualityGatePassed, true);
    const id = scenario.scenarioId;
    const change = await call(`/training/scenarios/${id}`, "PATCH", {monthlyRent: 100});
    assert.equal(change.status, 200);
    assert.equal((await change.json()).qualityGatePassed, false);
    assert.equal((await call(`/training/scenarios/${id}/promote`, "POST", {})).status, 403);
    await call(`/training/scenarios/${id}`, "PATCH", {monthlyRent: 1000, investmentAssumptions: {...assumptions, region: "outside"}});
    await pool.query(`UPDATE module_data SET data = jsonb_set(jsonb_set(data,
      '{qualityGatePassed}', 'true'), '{score,totalScore}', '100')
      WHERE tenant_id=$1 AND data_key=$2`, [tenantId, `training-scenario:${id}`]);
    assert.equal((await call(`/training/scenarios/${id}/promote`, "POST", {})).status, 403);
    const listed = await (await call("/training/scenarios")).json();
    assert.equal(listed.find(item => item.scenarioId === id).qualityGatePassed, false);
    await call(`/training/scenarios/${id}`, "PATCH", {investmentAssumptions: {...assumptions, region: "gooi"}});
    const promotedResponse = await call(`/training/scenarios/${id}/promote`, "POST", {});
    assert.equal(promotedResponse.status, 200);
    const promoted = await promotedResponse.json();
    assert.equal(promoted.deal.score.assessment.circle, 2);
    assert.deepEqual(promoted.deal.score.assessment, promoted.scenario.score.assessment);
    const detail = await (await call(`/deals/${promoted.deal.dealId}`)).json();
    assert.deepEqual(detail.deal.score.assessment, promoted.deal.score.assessment);
    assert.equal(detail.netRoi.totalInvestment, 135000);
    const report = await call(`/deals/${promoted.deal.dealId}/investor-ready-sheet`);
    assert.equal(report.status, 200);
    const text = await report.text();
    assert.ok(text.includes("Totale investering: EUR 135000.00"));
    assert.ok(text.includes("Cirkel 2"));
    assert.ok(text.includes(`Bruto BAR: ${detail.deal.score.assessment.grossYieldPercent.toFixed(2)}%`));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
