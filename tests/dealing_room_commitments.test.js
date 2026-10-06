import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express from "express";

const databaseName = process.env.DEALING_ROOM_COMMITMENTS_TEST_DATABASE;
const configured = process.env.DATABASE_URL
  ? decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1))
  : undefined;
if (!databaseName || !/^dealing_room_commitments_[a-f0-9]{32}$/.test(databaseName) || configured !== databaseName) {
  throw new Error("Run through test:dealing-room-commitments; only its disposable database is accepted.");
}

let pool;
let server;
after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (pool) await pool.end();
});

const request = (base, token, path, options = {}) =>
  fetch(`${base}${path}`, {
    ...options,
    headers: { authorization: token, ...(options.body ? { "content-type": "application/json" } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

function deal(id, owner) {
  const now = new Date().toISOString();
  return { dealId: id, propertyId: `property-${id}`, title: "Deal", region: "Amsterdam", propertyType: "Appartement", energyLabel: "C", woonoppervlak: 80, askingPrice: 300000, renovationCost: 10000, expectedValue: 350000, monthlyRent: 1500, status: "REVIEW", ownerId: owner, score: { totalScore: 80, decision: "GO", breakdown: [] }, createdAt: now, updatedAt: now };
}
function investor(id, owner, name, budgetMax = 500000) {
  const now = new Date().toISOString();
  return { investorId: id, name, email: `${id}@test.invalid`, riskProfile: "HIGH", budgetMin: 1, budgetMax, preferredRegions: ["Amsterdam"], interests: ["Appartement"], ownerId: owner, createdAt: now, updatedAt: now };
}

test("commitments are tenant-scoped, match-gated, and reject overcommitment", async () => {
  const [{ requireDb }, { default: dealsRouter }] = await Promise.all([
    import("../lib/db/src/index.ts"),
    import("../artifacts/api-server/src/routes/deals.ts"),
  ]);
  pool = requireDb().pool;
  const tenantA = randomUUID(), tenantB = randomUUID();
  const ownerA = `owner-${randomUUID()}`, ownerB = `owner-${randomUUID()}`;
  const dealA = `deal-${randomUUID()}`, dealB = `deal-${randomUUID()}`;
  const investorA = `investor-${randomUUID()}`, investorA2 = `investor-${randomUUID()}`;
  const investorB = `investor-${randomUUID()}`;
  const principal = new Map([
    ["Bearer a", { id: ownerA, tenantId: tenantA, role: "owner" }],
    ["Bearer b", { id: ownerB, tenantId: tenantB, role: "owner" }],
  ]);
  await pool.query(`INSERT INTO tenants (id, name, is_personal) VALUES ($1, 'Commit A', true), ($2, 'Commit B', true)`, [tenantA, tenantB]);
  const seed = async (tenant, key, value) => pool.query(
    `INSERT INTO module_data (tenant_id, module_name, data_key, data, source_file) VALUES ($1, 'EnterpriseModulesX', $2, $3::jsonb, 'commitments-test.json')`,
    [tenant, key, JSON.stringify(value)],
  );
  await Promise.all([
    seed(tenantA, `deal:${dealA}`, deal(dealA, ownerA)),
    seed(tenantB, `deal:${dealB}`, deal(dealB, ownerB)),
    seed(tenantA, `investor:${investorA}`, investor(investorA, ownerA, "Investor A")),
    seed(tenantA, `investor:${investorA2}`, investor(investorA2, ownerA, "Investor A2")),
    seed(tenantB, `investor:${investorB}`, investor(investorB, ownerB, "Investor B")),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const user = principal.get(req.header("authorization"));
    if (user) req.dbUser = user;
    next();
  });
  app.use("/api", dealsRouter);
  server = app.listen(0);
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  assert.equal((await request(base, "Bearer a", `/deals/${dealB}/commitments`)).status, 404);
  const put = await request(base, "Bearer a", `/deals/${dealA}/commitments/${investorA}`, { method: "PUT", body: { committedAmount: 100000 } });
  assert.equal(put.status, 200);
  const summary = await put.json();
  assert.equal(summary.totalCommittedAmount, 100000);
  assert.equal(summary.commitments[0].investorId, investorA);
  const over = await request(base, "Bearer a", `/deals/${dealA}/commitments/${investorA}`, { method: "PUT", body: { committedAmount: 999999999 } });
  assert.equal(over.status, 409);
  const concurrent = await Promise.all([
    request(base, "Bearer a", `/deals/${dealA}/commitments/${investorA}`, { method: "PUT", body: { committedAmount: 180000 } }),
    request(base, "Bearer a", `/deals/${dealA}/commitments/${investorA2}`, { method: "PUT", body: { committedAmount: 180000 } }),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
  const finalSummary = await (await request(base, "Bearer a", `/deals/${dealA}/commitments`)).json();
  assert.ok(finalSummary.totalCommittedAmount <= finalSummary.totalInvestment);
  assert.equal((await request(base, "Bearer a", `/deals/${dealA}/commitments/${investorB}`, { method: "PUT", body: { committedAmount: 1 } })).status, 404);
  assert.equal((await request(base, "Bearer b", `/deals/${dealA}/commitments/${investorA}`, { method: "PUT", body: { committedAmount: 1 } })).status, 404);
});