import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseName = process.env.LEGACY_SESSION_CLEANUP_TEST_DATABASE;
const configuredDatabase = process.env.DATABASE_URL
  ? decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1))
  : undefined;

if (
  !databaseName ||
  !/^legacy_session_cleanup_[a-f0-9]{32}$/u.test(databaseName) ||
  configuredDatabase !== databaseName
) {
  throw new Error(
    "Run through test:legacy-session-cleanup:postgres; only its disposable database is accepted.",
  );
}

let pool;

after(async () => {
  if (pool) await pool.end();
});

async function rows(query, parameters) {
  const result = await pool.query(query, parameters);
  return JSON.parse(JSON.stringify(result.rows));
}

async function tableSchema(tableName) {
  return {
    columns: await rows(
      `SELECT column_name, data_type, is_nullable, character_maximum_length,
              column_default, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName],
    ),
    constraints: await rows(
      `SELECT conname AS name, contype AS type, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = ('public.' || $1::text)::regclass
       ORDER BY conname`,
      [tableName],
    ),
    indexes: await rows(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = $1
       ORDER BY indexname`,
      [tableName],
    ),
  };
}

async function foreignKeyDefinitions() {
  return rows(
    `SELECT con.conname AS name,
            con.conrelid::regclass::text AS source_table,
            con.confrelid::regclass::text AS target_table,
            pg_get_constraintdef(con.oid) AS definition
     FROM pg_constraint AS con
     WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
     ORDER BY con.conname`,
  );
}

async function readPreservedState() {
  return {
    usersSchema: await tableSchema("users"),
    users: await rows("SELECT to_jsonb(user_row) AS row FROM public.users AS user_row ORDER BY id"),
    sessionSchema: await tableSchema("sessions"),
    foreignKeys: await foreignKeyDefinitions(),
    properties: await rows(
      "SELECT to_jsonb(property_row) AS row FROM public.properties AS property_row ORDER BY property_id",
    ),
    moduleData: await rows(
      `SELECT to_jsonb(module_row) AS row FROM public.module_data AS module_row
       ORDER BY tenant_id, module_name, data_key`,
    ),
    auditData: await rows(
      `SELECT to_jsonb(audit_row) AS row FROM public.audit_events AS audit_row
       ORDER BY tenant_id, sequence_id, event_id`,
    ),
  };
}

async function runCleanup(expectedRows) {
  const cleanupScript = path.join(root, "scripts/src/legacy-session-cleanup.ts");
  const tsx = path.join(root, "scripts/node_modules/.bin/tsx");
  const args = [
    cleanupScript,
    "apply",
    "--environment",
    "development",
    "--database",
    databaseName,
    "--expected-rows",
    String(expectedRows),
    "--approval-reference",
    "TEST-77",
    "--confirm",
    `development/${databaseName}`,
  ];

  try {
    const { stdout, stderr } = await execFileAsync(tsx, args, {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
        REALESTATEX_DEPLOYMENT_ENV: "development",
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { exitCode: 0, output: `${stdout}\n${stderr}` };
  } catch (error) {
    return {
      exitCode: typeof error.code === "number" ? error.code : 1,
      output: `${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error.message}`,
    };
  }
}

test("PostgreSQL cleanup keeps active/grace sessions and customer data, and rolls back a stale preview", async () => {
  const { requireDb } = await import("../lib/db/src/index.ts");
  pool = requireDb().pool;

  await pool.query(
    `INSERT INTO public.tenants (id, name, is_personal)
     VALUES ('00000000-0000-0000-0000-000000000001', 'Cleanup test tenant', true)`,
  );
  await pool.query(
    `INSERT INTO public.users (id, email, first_name, last_name, tenant_id)
     VALUES ('cleanup-test-user', 'cleanup-test@example.invalid', 'Cleanup', 'Test',
             '00000000-0000-0000-0000-000000000001')`,
  );
  await pool.query(
    `INSERT INTO public.properties
       (property_id, owner_id, adres, type, bouwjaar, woonoppervlak, energielabel, kenmerken)
     VALUES ('cleanup-test-property', 'cleanup-test-user', 'Testlaan 1', 'Appartement',
             1999, 80, 'C', '{"source":"integration-test"}'::jsonb)`,
  );
  await pool.query(
    `INSERT INTO public.module_data (tenant_id, module_name, data_key, data, source_file)
     VALUES ('00000000-0000-0000-0000-000000000001', 'CleanupTest', 'customer-record',
             '{"customer":"preserve-me"}'::jsonb, 'cleanup-test.json')`,
  );
  await pool.query(
    `INSERT INTO public.audit_events
       (event_id, tenant_id, sequence_id, previous_hash, event_hash, action,
        entity_type, entity_id, actor_id, metadata)
     VALUES ('cleanup-test-audit', '00000000-0000-0000-0000-000000000001',
             1, NULL, 'cleanup-test-hash', 'cleanup.test.seeded',
             'property', 'cleanup-test-property', 'cleanup-test-user',
             '{"preserve":true}'::jsonb)`,
  );
  await pool.query(
    `INSERT INTO public.sessions (sid, sess, expire)
     VALUES
       ('active-session', '{"access_token":"keep-active"}'::jsonb,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'),
       ('grace-session', '{"user":{"id":"grace-user"}}'::jsonb,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '29 days'),
       ('near-boundary-session', '{"user":{"id":"recently-expired"}}'::jsonb,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '29 days 23 hours'),
       ('old-token-session', '{"refresh_token":"expired"}'::jsonb,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '31 days'),
       ('old-session-without-token', '{"user":{"id":"old-user"}}'::jsonb,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '90 days')`,
  );

  const initialSessions = await rows(
    "SELECT to_jsonb(session_row) AS row FROM public.sessions AS session_row ORDER BY sid",
  );
  assert.equal(initialSessions.length, 5);

  const baseline = await readPreservedState();
  assert.ok(
    baseline.foreignKeys.some(
      (foreignKey) =>
        foreignKey.source_table === "users" &&
        foreignKey.target_table === "tenants",
    ),
    "fixture should include the users-to-tenants foreign key",
  );
  assert.equal(
    baseline.foreignKeys.some(
      (foreignKey) =>
        foreignKey.source_table === "sessions" ||
        foreignKey.target_table === "sessions",
    ),
    false,
    "session cleanup fixture must not add a session foreign key",
  );
  assert.deepEqual(
    baseline.sessionSchema.columns.map((column) => [
      column.column_name,
      column.data_type,
      column.is_nullable,
    ]),
    [
      ["sid", "character varying", "NO"],
      ["sess", "jsonb", "NO"],
      ["expire", "timestamp without time zone", "NO"],
    ],
  );

  const stalePreview = await runCleanup(1);
  assert.notEqual(stalePreview.exitCode, 0, stalePreview.output);
  assert.match(stalePreview.output, /Preview changed: expected 1 eligible row\(s\), found 2/u);
  assert.deepEqual(
    await rows(
      "SELECT to_jsonb(session_row) AS row FROM public.sessions AS session_row ORDER BY sid",
    ),
    initialSessions,
    "a preview-count mismatch must roll back without deleting any session",
  );
  assert.deepEqual(await readPreservedState(), baseline);

  const approvedApply = await runCleanup(2);
  assert.equal(approvedApply.exitCode, 0, approvedApply.output);
  assert.match(approvedApply.output, /Deleted 2 expired legacy session row\(s\)/u);

  const remainingSessions = await rows(
    "SELECT sid FROM public.sessions ORDER BY sid",
  );
  assert.deepEqual(remainingSessions.map((row) => row.sid), [
    "active-session",
    "grace-session",
    "near-boundary-session",
  ]);
  assert.deepEqual(
    await readPreservedState(),
    baseline,
    "cleanup must leave user records, constraints, schemas, application rows, and audit rows unchanged",
  );
});
