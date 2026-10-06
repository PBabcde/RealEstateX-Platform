import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOptions,
  verifyNoSessionDeleteSideEffects,
  validateConfiguredEnvironment,
} from "../scripts/src/legacy-session-cleanup.ts";

test("preview requires a named environment and database", () => {
  assert.deepEqual(
    parseOptions([
      "preview",
      "--environment",
      "staging",
      "--database",
      "realestatex_staging",
    ]),
    {
      mode: "preview",
      environment: "staging",
      database: "realestatex_staging",
    },
  );
  assert.throws(
    () => parseOptions(["preview", "--environment", "production"]),
    /Both --environment and --database are required/u,
  );
});

test("apply requires a reviewed count, approval reference, and exact target confirmation", () => {
  const options = parseOptions([
    "apply",
    "--environment",
    "production",
    "--database",
    "realestatex_production",
    "--expected-rows",
    "12",
    "--approval-reference",
    "CHG-1234",
    "--confirm",
    "production/realestatex_production",
  ]);
  assert.equal(options.expectedRows, 12);
  assert.equal(options.approvalReference, "CHG-1234");

  assert.throws(
    () =>
      parseOptions([
        "apply",
        "--environment",
        "production",
        "--database",
        "realestatex_production",
      ]),
    /Apply requires/u,
  );
  assert.throws(
    () =>
      parseOptions([
        "apply",
        "--environment",
        "production",
        "--database",
        "realestatex_production",
        "--expected-rows",
        "12",
        "--approval-reference",
        "CHG-1234",
        "--confirm",
        "staging/realestatex_production",
      ]),
    /Apply requires/u,
  );
});

test("environment and database names are constrained to the supported target", () => {
  assert.throws(
    () =>
      parseOptions([
        "preview",
        "--environment",
        "prod",
        "--database",
        "realestatex_production",
      ]),
    /Unsupported environment/u,
  );
  assert.throws(
    () =>
      parseOptions([
        "preview",
        "--environment",
        "production",
        "--database",
        "realestatex_production;DROP TABLE users",
      ]),
    /expected PostgreSQL database name/u,
  );
  assert.throws(
    () =>
      validateConfiguredEnvironment(
        {
          mode: "preview",
          environment: "production",
          database: "realestatex_production",
        },
        "staging",
      ),
    /Target mismatch/u,
  );
});

test("a zero-row apply still requires all approval gates", () => {
  assert.equal(
    parseOptions([
      "apply",
      "--environment",
      "development",
      "--database",
      "realestatex_dev",
      "--expected-rows",
      "0",
      "--approval-reference",
      "OPS-42",
      "--confirm",
      "development/realestatex_dev",
    ]).expectedRows,
    0,
  );
});

test("session cleanup refuses foreign-key and trigger side effects", async () => {
  const clearSessionTable = {
    query: async () => ({ rows: [], rowCount: 0 }),
    release() {},
  };
  await assert.doesNotReject(() =>
    verifyNoSessionDeleteSideEffects(clearSessionTable),
  );

  const hasForeignKey = {
    query: async (query) => ({
      rows: query.includes("pg_constraint")
        ? [{ constraint_name: "sessions_reference_fk" }]
        : [],
      rowCount: 1,
    }),
    release() {},
  };
  await assert.rejects(
    () => verifyNoSessionDeleteSideEffects(hasForeignKey),
    /foreign-key or trigger side effects/u,
  );

  const hasTrigger = {
    query: async (query) => ({
      rows: query.includes("pg_trigger")
        ? [{ trigger_name: "audit_session" }]
        : [],
      rowCount: 1,
    }),
    release() {},
  };
  await assert.rejects(
    () => verifyNoSessionDeleteSideEffects(hasTrigger),
    /foreign-key or trigger side effects/u,
  );
});
