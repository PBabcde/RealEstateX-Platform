import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { test } from "node:test";
import express from "express";

test("property dossier CRUD and Energy Brain use real PostgreSQL and preserve access boundaries", async (t) => {
  const name = process.env.DEALING_ROOM_TEST_DATABASE;
  if (!name || !/^dealing_room_isolation_[a-f0-9]{32}$/.test(name) ||
      decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)) !== name) {
    throw new Error("Only run through the disposable property-dossier API test runner.");
  }
  const [{ requireDb }, { default: router }, { calculateEnergyBrain }] = await Promise.all([
    import("../lib/db/src/index.ts"),
    import("../artifacts/api-server/src/routes/realestatex.ts"),
    import("../artifacts/api-server/src/lib/energy-brain.ts"),
  ]);
  const { pool } = requireDb();
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const strangerId = randomUUID();
  let server;
  try {
    const migration = await fs.readFile(new URL("../lib/db/drizzle/0011_property_dossier.sql", import.meta.url), "utf8");
    // Prove the forward migration also preserves an existing legacy dossier.
    await pool.query(`INSERT INTO properties(property_id,owner_id,adres,type,bouwjaar,woonoppervlak,energielabel)
      VALUES('legacy-dossier',$1,'Bestaand dossier','Woning',1990,80,'D')`, [ownerId]);
    await pool.query(migration);
    await pool.query(migration);
    assert.equal((await pool.query("SELECT adres FROM properties WHERE property_id='legacy-dossier'")).rows[0].adres, "Bestaand dossier");
    await pool.query("INSERT INTO tenants(id,name,is_personal) VALUES($1,'Dossier integration test',true)", [tenantId]);
    const app = express();
    app.use(express.json());
    // Test-only identity injection; the production middleware is unchanged.
    app.use((req, _res, next) => {
      const actor = req.headers["x-test-actor"];
      if (actor !== "anonymous") req.dbUser = { id: actor === "stranger" ? strangerId : ownerId, tenantId, role: "owner" };
      next();
    });
    app.use("/api", router);
    app.use((error, _req, res, _next) => {
      res.status(500).json({ error: error.message });
    });
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const call = (path, method = "GET", body, actor = "owner") =>
      fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { "content-type": "application/json", "x-test-actor": actor },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const input = {
      naam: "  Testdossier  ", adres: "Teststraat 1", postcode: "1234 AB", plaats: "Testplaats",
      type: "Appartement", bouwjaar: 1980, woonoppervlak: 85.5, perceel: 100.25,
      energielabel: "C", huurprijs: 1250.50, marktwaarde: 345000.75,
      ownerId: strangerId, createdAt: "2000-01-01T00:00:00.000Z",
    };
    let property;

    await t.test("create validates and persists all dossier fields without accepting ownership spoofing", async () => {
      const response = await call("/properties", "POST", input);
      assert.equal(response.status, 201, await response.clone().text());
      property = await response.json();
      assert.equal(property.naam, "Testdossier");
      assert.equal(property.ownerId, ownerId);
      assert.notEqual(property.createdAt, input.createdAt);
      assert.ok(Number.isFinite(Date.parse(property.createdAt)));
      const saved = (await pool.query("SELECT * FROM properties WHERE property_id=$1", [property.propertyId])).rows[0];
      assert.equal(saved.postcode, input.postcode);
      assert.equal(saved.plaats, input.plaats);
      assert.equal(Number(saved.huurprijs), input.huurprijs);
      assert.equal(Number(saved.marktwaarde), input.marktwaarde);
      assert.equal(saved.woonoppervlak, 85.5);
      assert.equal(saved.perceel, 100.25);
    });

    const path = `/properties/${property.propertyId}`;
    await t.test("read and list return only the actor's dossiers", async () => {
      assert.deepEqual(await (await call(path)).json(), property);
      assert.ok((await (await call("/properties")).json()).some(p => p.propertyId === property.propertyId));
      assert.deepEqual(await (await call("/properties", "GET", undefined, "stranger")).json(), []);
    });
    await t.test("JSON report uses the saved property and indicates the market-value yield basis", async () => {
      const response = await call(`/properties/${property.propertyId}/report`);
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const report = await response.json();
      assert.equal(report.property.property_id, property.propertyId);
      assert.equal(report.property.address, input.adres);
      assert.equal(report.property.monthly_rent_eur, input.huurprijs);
      assert.equal(report.energy_brain.score, 70);
      assert.equal(report.energy_brain.recommended_measure, "HR++ glas");
      assert.equal(report.profitability.gross_yield_percent, 4.35);
      assert.equal(report.profitability.classification, "Gemiddeld");
      assert.match(report.profitability.note, /niet de BAR op totale investering/);
      assert.equal(report.recommendation, "Optimalisatie aanbevolen");
      assert.match(report.disclaimer, /afzonderlijke RealEstateX-investeringstoets/);
    });
    await t.test("PDF endpoint downloads a private, valid report containing all seven sections", async () => {
      const response = await call(`/properties/${property.propertyId}/report/pdf`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "application/pdf");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.match(response.headers.get("content-disposition"), /^attachment; filename="realestatex-rapport-/);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.toString("latin1", 0, 8), "%PDF-1.3");
      const pdf = execFileSync("pdftotext", ["-", "-"], { input: bytes, encoding: "utf8" });
      for (const section of [
        "Vastgoedrapport", "1. Vastgoedobject", "2. Financiële analyse",
        "3. Energy Brain-analyse", "4. Aanbevolen maatregel",
        "5. Geschatte jaarlijkse besparing", "6. Indicatieve terugverdientijd",
        "7. Eindconclusie", "Teststraat 1",
      ]) assert.ok(pdf.includes(section), `PDF missing section or property text: ${section}`);
    });
    await t.test("all operations reject anonymous users and other owners", async () => {
      for (const [url, method, body] of [
        [path, "GET"], [path, "PUT", input], [path, "PATCH", { naam: "Verboden" }],
        [path, "DELETE"], [`${path}/energy-brain`, "GET"],
        [`${path}/report`, "GET"], [`${path}/report/pdf`, "GET"],
      ]) {
        assert.equal((await call(url, method, body, "anonymous")).status, 401);
        assert.equal((await call(url, method, body, "stranger")).status, 403);
      }
      assert.equal((await call("/properties", "POST", input, "anonymous")).status, 401);
    });
    await t.test("all nine label scores, measures and financial estimates match the requested baseline", async () => {
      for (const [label, score, measure, investment] of [
        ["G", 30, "Spouwmuurisolatie", 2500], ["F", 40, "Spouwmuurisolatie", 2500],
        ["E", 50, "Spouwmuurisolatie", 2500], ["D", 60, "HR++ glas", 4500],
        ["C", 70, "HR++ glas", 4500], ["B", 80, "Warmtepomp voorbereiding", 6000],
        ["A", 90, "Zonnepanelen optimalisatie", 3500], ["A+", 95, "Batterijopslag advies", 7000],
        ["A++", 100, "Netcongestie optimalisatie", 3000],
      ]) {
        assert.equal((await call(path, "PATCH", { energielabel: label })).status, 200);
        const response = await call(`${path}/energy-brain`);
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.property_id, property.propertyId);
        assert.equal(result.energy_score, score);
        assert.equal(result.recommended_measure, measure);
        assert.equal(result.estimated_investment, investment);
        assert.equal(result.estimated_annual_saving, investment * 0.18);
        assert.equal(result.payback_years, 5.56);
        assert.equal(result.indicative, true);
        assert.match(result.methodology, /18%/);
      }
      assert.equal(calculateEnergyBrain(" c ", 1980, 85.5).energy_score, 70);
      for (const args of [["Z", 1980, 80], ["A+++", 1980, 80], ["C", NaN, 80], ["C", 1980, Infinity], ["C", 1980, 0]]) {
        assert.throws(() => calculateEnergyBrain(...args));
      }
      await call(path, "PATCH", { energielabel: "onbekend" });
      assert.equal((await call(`${path}/energy-brain`)).status, 400);
    });
    await t.test("invalid edits return 400 without changing the saved dossier", async () => {
      const before = await (await call(path)).json();
      for (const invalid of [{}, { naam: " " }, { huurprijs: -1 }, { marktwaarde: -1 }, { woonoppervlak: 0 }, { bouwjaar: 1980.5 }]) {
        assert.equal((await call(path, "PATCH", invalid)).status, 400);
      }
      assert.equal((await call(path, "PUT", { naam: "Incompleet" })).status, 400);
      assert.equal((await call("/properties", "POST", { ...input, adres: " " })).status, 400);
      assert.deepEqual(await (await call(path)).json(), before);
    });
    await t.test("PATCH clears explicit nulls but preserves omissions; PUT clears omitted optional fields", async () => {
      const patch = await (await call(path, "PATCH", { naam: null })).json();
      assert.equal(patch.naam, null);
      assert.equal(patch.huurprijs, input.huurprijs);
      const put = await call(path, "PUT", {
        adres: "Nieuw adres", type: "Woning", bouwjaar: 2001, woonoppervlak: 95.25, energielabel: "B",
      });
      assert.equal(put.status, 200, await put.clone().text());
      const replaced = await put.json();
      assert.equal(replaced.naam, null);
      assert.equal(replaced.postcode, null);
      assert.equal(replaced.plaats, null);
      assert.equal(replaced.huurprijs, null);
      assert.equal(replaced.marktwaarde, null);
      assert.equal(replaced.perceel, undefined);
      assert.equal(replaced.ownerId, ownerId);
      assert.equal(replaced.createdAt, property.createdAt);
      assert.ok(Date.parse(replaced.updatedAt) > Date.parse(property.updatedAt));
      assert.deepEqual(await (await call(path)).json(), replaced);
    });
    await t.test("delete removes the persisted dossier and subsequent operations return 404", async () => {
      assert.equal((await call(path, "DELETE")).status, 204);
      assert.equal((await pool.query("SELECT count(*) FROM properties WHERE property_id=$1", [property.propertyId])).rows[0].count, "0");
      for (const [url, method, body] of [
        [path, "GET"], [path, "PUT", input], [path, "PATCH", { naam: "Niet herstellen" }],
        [path, "DELETE"], [`${path}/energy-brain`, "GET"], [`${path}/report`, "GET"],
        [`${path}/report/pdf`, "GET"],
      ]) assert.equal((await call(url, method, body)).status, 404);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
