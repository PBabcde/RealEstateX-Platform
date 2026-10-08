import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { DEFAULT_TENANT_ID } from "@workspace/db/schema";
import { requireDb } from "@workspace/db";

const { pool } = requireDb();
let server;
let base;
const marker = `sales-test-${Date.now()}`;

before(async () => {
  const { default: app } = await import("../artifacts/api-server/src/app.ts");
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
});

const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  });

test("lead capture requires GDPR consent, a name and a valid email", async () => {
  assert.equal((await post("/public/leads", { name: "A", email: `${marker}@example.com` })).status, 400);
  assert.equal((await post("/public/leads", { name: "A", email: "nope", consent: true })).status, 400);
  assert.equal((await post("/public/leads", { email: `${marker}@example.com`, consent: true })).status, 400);
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
