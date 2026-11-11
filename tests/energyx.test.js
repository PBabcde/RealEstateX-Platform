import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { DEFAULT_TENANT_ID } from "../lib/db/src/schema/index.ts";
import { requireDb } from "../lib/db/src/index.ts";

const { pool } = requireDb();
const marker = `energyx-test-${Date.now()}`;
let server;
let base;
let currentUser;

before(async () => {
  const { createRequire } = await import("node:module");
  const express = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url))("express");
  const router = (await import("../artifacts/api-server/src/routes/energyx.ts")).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.dbUser = currentUser;
    next();
  });
  app.use("/api", router);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1/energyx`;
  currentUser = { id: `${marker}-owner`, role: "owner", tenantId: DEFAULT_TENANT_ID };
  await pool.query(
    "INSERT INTO properties (property_id, owner_id, adres, type, bouwjaar, woonoppervlak, energielabel) VALUES ($1,$2,'Teststraat 1','Appartement',1985,100,'D')",
    [marker, currentUser.id],
  );
});

after(async () => {
  try {
    await pool.query("DELETE FROM energyx_syncs WHERE property_id = $1", [marker]);
    await pool.query("DELETE FROM properties WHERE property_id = $1", [marker]);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});

const call = (path, body) =>
  fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

test("sync needs consent, valid specs and an accessible property", async () => {
  assert.equal((await call("/sync", { propertyId: marker })).status, 400);
  assert.equal((await call("/sync", { propertyId: marker, consent: true, specs: { glazing: "x" } })).status, 400);
  assert.equal((await call("/sync", { propertyId: "missing", consent: true })).status, 404);
  const other = currentUser;
  currentUser = { id: "someone-else", role: "owner", tenantId: DEFAULT_TENANT_ID };
  assert.equal((await call("/sync", { propertyId: marker, consent: true })).status, 404);
  assert.equal((await call(`/metrics/${marker}`)).status, 404);
  currentUser = other;
});

test("sync stores a snapshot and serves distinct B2B and B2C views", async () => {
  assert.equal((await (await call(`/status/${marker}`)).json()).status, "not_synced");
  assert.equal((await call(`/metrics/${marker}`)).status, 409);
  const sync = await call("/sync", { propertyId: marker, consent: true, specs: { glazing: "dubbel", roofAreaM2: 80, wwsPoints: 140, wwsPointsGain: 12 } });
  assert.equal(sync.status, 200);
  assert.equal((await (await call(`/status/${marker}`)).json()).status, "synced");
  const b2b = await (await call(`/metrics/${marker}?view=b2b`)).json();
  assert.equal(b2b.view, "b2b");
  assert.equal(b2b.building.areaM2, 100);
  assert.equal(b2b.building.energyLabel, "D");
  assert.equal(b2b.specs.wwsPointsGain, 12);
  assert.ok(b2b.specs.heatingKw > 0 && b2b.metrics.solar.panels > 0 && b2b.quoteIndication.max > b2b.quoteIndication.min);
  const b2c = await (await call(`/metrics/${marker}?view=b2c`)).json();
  assert.equal(b2c.view, "b2c");
  assert.ok(b2c.monthlySavingsEur > 0);
  assert.equal(b2c.specs, undefined);
  assert.equal((await call(`/metrics/${marker}?view=x`)).status, 400);
});

test("portfolio aggregates synced properties and service requests are audited", async () => {
  const portfolio = await (await call("/portfolio")).json();
  assert.ok(portfolio.properties >= 1 && portfolio.totalAnnualSavings > 0);
  const response = await call("/service-request", { propertyId: marker, kind: "maintenance", note: "Controle van de warmtepomp" });
  assert.equal(response.status, 201);
  const { requestId } = await response.json();
  const audit = await pool.query("SELECT metadata FROM audit_events WHERE action='energyx.service_request' AND metadata->>'requestId' = $1", [requestId]);
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].metadata.kind, "maintenance");
  assert.equal(audit.rows[0].metadata.note, "Controle van de warmtepomp");
});

test("deleting a property removes its snapshot and excludes legacy orphans from all portfolios", async () => {
  const { deleteProperty } = await import("../artifacts/api-server/src/lib/realestatex-storage.ts");
  const savedSnapshot = await pool.query("SELECT * FROM energyx_syncs WHERE property_id = $1", [marker]);
  assert.equal(savedSnapshot.rowCount, 1);
  // A forbidden deletion must not erase the actual owner's snapshot.
  assert.equal(await deleteProperty(marker, "someone-else", "someone-else"), false);
  assert.equal((await pool.query("SELECT property_id FROM energyx_syncs WHERE property_id = $1", [marker])).rowCount, 1);
  assert.equal(await deleteProperty(marker, currentUser.id, currentUser.id), true);
  assert.equal((await pool.query("SELECT property_id FROM energyx_syncs WHERE property_id = $1", [marker])).rowCount, 0);
  assert.equal((await call(`/status/${marker}`)).status, 404);
  assert.equal((await call(`/metrics/${marker}`)).status, 404);
  const empty = await (await call("/portfolio")).json();
  assert.equal(empty.properties, 0);
  assert.equal(empty.totalAnnualSavings, 0);
  assert.equal(empty.totalInvestment, 0);
  assert.deepEqual(empty.items, []);

  // Simulate old data created before cleanup was implemented (or a late sync write).
  await pool.query(
    "INSERT INTO energyx_syncs (property_id, owner_id, status, payload) VALUES ($1,$2,'synced',$3)",
    [marker, currentUser.id, savedSnapshot.rows[0].payload],
  );
  assert.equal((await (await call("/portfolio")).json()).properties, 0);
  const owner = currentUser;
  try {
    currentUser = { ...owner, role: "admin" };
    const portfolio = await (await call("/portfolio")).json();
    assert.ok(!portfolio.items.some((item) => item.propertyId === marker));
  } finally {
    currentUser = owner;
  }
});
