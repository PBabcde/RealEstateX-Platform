import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRequire } from "node:module";
import { DEFAULT_TENANT_ID } from "@workspace/db/schema";
import { requireDb } from "@workspace/db";

const apiRequire = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const express = apiRequire("express");
const { pool } = requireDb();
let server;
let base;
let requestAddress = 1;
const marker = `sales-test-${Date.now()}`;
const oldAdminKey = process.env.ADMIN_ACCESS_KEY;
const oldSessionSecret = process.env.SESSION_SECRET;

before(async () => {
  const router = (await import("../artifacts/api-server/src/routes/index.ts")).default;
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await pool.query("DELETE FROM leads WHERE email LIKE $1", [`${marker}%`]);
  await pool.query("DELETE FROM traffic_events WHERE session_id LIKE $1", [`${marker.replaceAll("-", "")}%`]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  if (oldAdminKey === undefined) delete process.env.ADMIN_ACCESS_KEY;
  else process.env.ADMIN_ACCESS_KEY = oldAdminKey;
  if (oldSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = oldSessionSecret;
});

const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${requestAddress++}` },
    body: JSON.stringify(body),
  });

test("lead capture requires GDPR consent and a valid email, but not a name", async () => {
  assert.equal((await post("/public/leads", { name: "A", email: `${marker}@example.com` })).status, 400);
  assert.equal((await post("/public/leads", { name: "A", email: "nope", consent: true })).status, 400);
  assert.equal((await post("/public/leads", { email: `${marker}-optional@example.com`, consent: true })).status, 201);
});

test("a consented lead is stored in the public tenant with a score and audit event", async () => {
  const response = await post("/public/leads", {
    name: "Test Lead",
    email: `${marker}@Example.com`,
    phone: "0612345678",
    company: "Testbedrijf",
    consent: true,
  });
  assert.equal(response.status, 201);
  const { rows } = await pool.query("SELECT * FROM leads WHERE email = $1", [`${marker}@example.com`]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tenant_id, DEFAULT_TENANT_ID);
  assert.equal(rows[0].status, "new");
  assert.equal(rows[0].consent, true);
  assert.equal(rows[0].lead_score, 70);
  const audit = await pool.query(
    "SELECT 1 FROM audit_events WHERE action = 'sales.lead.captured' AND entity_id = $1",
    [rows[0].id],
  );
  assert.equal(audit.rowCount, 1);
});

test("the anonymous calculator endpoints validate input and return results without persisting", async () => {
  const response = await post("/valuations/calculate", { woonoppervlak: 82, energielabel: "A", locatieFactor: 1 });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(typeof result.valuation, "number");
  assert.equal(typeof result.pricePerSquareMeter, "number");
  assert.equal((await post("/valuations/calculate", { woonoppervlak: 0 })).status, 400);
  const rental = await post("/rentals/overview", { huurprijs: 1850, kosten: 340 * 12, investering: 425000 });
  assert.equal(rental.status, 200);
  const rentalResult = await rental.json();
  assert.equal(rentalResult.annualRendement, 18120);
  assert.ok(Math.abs(rentalResult.netYield - 4.263529411764706) < 0.000001);
});

test("admin access key creates a restricted session for account, sales and CRM", async () => {
  process.env.ADMIN_ACCESS_KEY = "test-admin-key-with-at-least-32-characters";
  process.env.SESSION_SECRET = oldSessionSecret ?? "test-session-secret-for-public-lead-capture";
  assert.deepEqual(await (await fetch(`${base}/admin-access/session`)).json(), { authenticated: false });

  const invalid = await post("/admin-access/session", { key: "wrong-key" });
  assert.equal(invalid.status, 401);
  const login = await post("/admin-access/session", { key: process.env.ADMIN_ACCESS_KEY });
  assert.equal(login.status, 201);
  const setCookie = login.headers.get("set-cookie");
  assert.ok(setCookie?.includes("HttpOnly") && setCookie.includes("SameSite=Strict"));
  const cookie = setCookie.split(";")[0];

  const status = await fetch(`${base}/admin-access/session`, { headers: { cookie } });
  assert.deepEqual(await status.json(), { authenticated: true });
  const account = await fetch(`${base}/account`, { headers: { cookie } });
  assert.equal((await account.json()).role, "admin");
  assert.equal((await fetch(`${base}/sales/leads`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${base}/crm/contacts`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${base}/visitor-intent/summary?days=30`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${base}/admin/control-room`, { headers: { cookie } })).status, 200);
  await fetch(`${base}/admin-access/session`, { method: "DELETE", headers: { cookie } });
  assert.deepEqual(await (await fetch(`${base}/admin-access/session`)).json(), { authenticated: false });
  process.env.SESSION_SECRET = oldSessionSecret ?? "test-session-secret-for-public-lead-capture";
});

test("duplicate email updates the existing lead and retains all lead sources", async () => {
  const email = `${marker}-duplicate@example.com`;
  const first = await post("/public/leads", {
    email, name: "Eerste naam", interest: "Rapport", source: "public_report_unlock", consent: true,
  });
  assert.equal(first.status, 201);
  const second = await post("/public/leads", {
    email, name: "Bijgewerkte naam", interest: "Catch of the Day", source: "catch_of_the_day", consent: true,
  });
  assert.equal(second.status, 201);
  const { rows } = await pool.query("SELECT * FROM leads WHERE email = $1", [email]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Bijgewerkte naam");
  assert.equal(rows[0].metadata.source, "catch_of_the_day");
  assert.deepEqual(rows[0].metadata.sources, ["public_report_unlock", "catch_of_the_day"]);
});

test("concurrent email captures keep one lead, follow-up status and submission history", async () => {
  const email = `${marker}-parallel@example.com`;
  const results = await Promise.all(["beta_community", "partner_interest"].map((source) => post("/public/leads", {
    email, source, consent: true, details: `Bijdrage van ${source}`,
  })));
  assert.deepEqual(results.map((response) => response.status), [201, 201]);
  const { rows } = await pool.query("SELECT * FROM leads WHERE email = $1", [email]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.sources.length, 2);
  assert.equal((await pool.query("SELECT * FROM crm_interactions WHERE lead_id = $1", [rows[0].id])).rowCount, 2);
  await pool.query("UPDATE leads SET status = 'qualified' WHERE id = $1", [rows[0].id]);
  await post("/public/leads", { email, consent: true, source: "public_report_unlock" });
  assert.equal((await pool.query("SELECT status FROM leads WHERE id = $1", [rows[0].id])).rows[0].status, "qualified");
});

test("admin sessions reject forged, expired, cross-site and disabled access", async () => {
  const previous = process.env.ADMIN_ACCESS_KEY;
  process.env.ADMIN_ACCESS_KEY = "test-admin-key-with-at-least-32-characters";
  const { createHmac } = await import("node:crypto");
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_ACCESS_KEY;
  const expiry = String(Math.floor(Date.now() / 1000) - 1);
  const signature = createHmac("sha256", secret)
    .update(`realestatex-admin:${process.env.ADMIN_ACCESS_KEY}:${expiry}`).digest("hex");
  for (const token of [`${expiry}.${signature}`, `${Math.floor(Date.now() / 1000) + 100}.${"0".repeat(64)}`]) {
    const cookie = `realestatex_admin_session=${token}`;
    assert.deepEqual(await (await fetch(`${base}/admin-access/session`, { headers: { cookie } })).json(), { authenticated: false });
    assert.equal((await fetch(`${base}/sales/leads`, { headers: { cookie } })).status, 401);
  }
  const crossSite = await fetch(`${base}/admin-access/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
    body: JSON.stringify({ key: process.env.ADMIN_ACCESS_KEY }),
  });
  assert.equal(crossSite.status, 403);
  const login = await post("/admin-access/session", { key: process.env.ADMIN_ACCESS_KEY });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${base}/properties`, { headers: { cookie } })).status, 401);
  delete process.env.ADMIN_ACCESS_KEY;
  assert.deepEqual(await (await fetch(`${base}/admin-access/session`, { headers: { cookie } })).json(), { authenticated: false });
  if (previous !== undefined) process.env.ADMIN_ACCESS_KEY = previous;
});

test("the honeypot field stores nothing", async () => {
  const email = `${marker}-bot@example.com`;
  assert.equal((await post("/public/leads", { name: "Bot", email, consent: true, website: "http://spam" })).status, 201);
  assert.equal((await pool.query("SELECT 1 FROM leads WHERE email = $1", [email])).rowCount, 0);
});

test("traffic events need consent, store only the path and a hashed address", async () => {
  const sessionId = `${marker.replaceAll("-", "")}abcdef`;
  const event = { sessionId, eventType: "page_view", pageUrl: "/suite?token=secret#x", referrer: "https://example.org/a?b=c" };
  assert.equal((await post("/public/traffic", event)).status, 400);
  assert.equal((await post("/public/traffic", { ...event, consent: true, eventType: "evil" })).status, 400);
  assert.equal((await post("/public/traffic", { ...event, consent: true })).status, 204);
  const { rows } = await pool.query("SELECT * FROM traffic_events WHERE session_id = $1", [sessionId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].page_url, "/suite");
  assert.equal(rows[0].referrer, "example.org");
  assert.match(rows[0].ip_hash, /^[0-9a-f]{64}$/u);
  assert.ok(!rows[0].ip_hash.includes("203.0.113.9"));
});

test("Sales & CRM endpoints reject signed-out requests", async () => {
  for (const path of ["/sales/leads", "/sales/analytics", "/sales/assistant"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 401, path);
  }
  assert.equal((await fetch(`${base}/sales/leads/00000000-0000-0000-0000-000000000000`, { method: "PATCH" })).status, 401);
});

test("admin login limit cannot be reset with caller-supplied forwarded addresses", async () => {
  process.env.ADMIN_ACCESS_KEY = "test-admin-key-with-at-least-32-characters";
  let lastStatus;
  for (let attempt = 0; attempt < 11; attempt++) {
    lastStatus = (await post("/admin-access/session", { key: "wrong" })).status;
    assert.ok(lastStatus === 401 || lastStatus === 429);
  }
  assert.equal(lastStatus, 429);
});
