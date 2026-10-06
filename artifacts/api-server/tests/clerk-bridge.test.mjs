import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

// Exercise the real bridge and permission helpers with verified-session and DB
// doubles, without touching real user data or requiring any Clerk credentials.
const bundle = await build({
  stdin: {
    contents: 'export * from "./src/middlewares/localUser"; export * from "./src/middlewares/authorization";',
    resolveDir: new URL("..", import.meta.url).pathname,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [{
    name: "bridge-test-dependencies",
    setup(builder) {
      builder.onResolve({ filter: /^(@clerk\/express|@workspace\/db|drizzle-orm)$/ }, ({ path }) => ({
        path, namespace: "bridge-test",
      }));
      builder.onLoad({ filter: /.*/, namespace: "bridge-test" }, ({ path }) => ({
        contents: path === "@clerk/express"
          ? "export const getAuth = req => req.testAuth;"
          : path === "drizzle-orm"
            ? "export const eq = (column, value) => ({ column, value });"
            : "export const usersTable = {id: 'users.id'}; export const requireDb = () => ({db: globalThis.__clerkBridgeTestDb});",
        loader: "js",
      }));
    },
  }],
});
const { resolveLocalUser, requireAuthentication, canAccessOwner, canManageOwner, isAdministrator } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function setup(rows = [], conflict = false) {
  const data = new Map(rows.map(row => [row.id, row]));
  const lookups = [];
  const writes = [];
  globalThis.__clerkBridgeTestDb = {
    select: () => ({
      from: () => ({
        where: condition => ({
          limit: async () => {
            lookups.push(condition.value);
            return data.has(condition.value) ? [data.get(condition.value)] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: values => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            writes.push(values);
            const row = { ...values, role: "owner", tenantId: "personal-tenant" };
            data.set(values.id, row);
            return conflict ? [] : [row];
          },
        }),
      }),
    }),
  };
  return { lookups, writes };
}

async function resolve(auth) {
  const req = { testAuth: auth };
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
  let continued = false;
  await resolveLocalUser(req, res, () => { continued = true; });
  return { req, res, continued };
}

test("migrated users resolve by legacy ID and retain roles and tenant", async () => {
  const existing = { id: "legacy-subject", role: "admin", tenantId: "existing-tenant" };
  const db = setup([existing]);
  const result = await resolve({
    userId: "user_clerk_native",
    sessionClaims: { userId: existing.id, email: "changed@example.invalid" },
  });
  assert.equal(result.continued, true);
  assert.deepEqual(db.lookups, [existing.id]);
  assert.deepEqual(db.writes, []);
  assert.deepEqual(result.req.dbUser, existing);
  assert.equal(isAdministrator(result.req), true);
  assert.equal(canManageOwner(result.req, "other-user"), true);
});

test("new users are provisioned without locally syncing identity", async () => {
  const db = setup();
  const { req, continued } = await resolve({
    userId: "user_new",
    sessionClaims: { userId: "user_new", email: "new@example.invalid", firstName: "New" },
  });
  assert.equal(continued, true);
  assert.deepEqual(db.writes, [{ id: "user_new" }]);
  assert.equal(req.dbUser.role, "owner");
  assert.equal(canAccessOwner(req, "user_new"), true);
  assert.equal(canAccessOwner(req, "someone-else"), false);
});

test("a concurrent first-request conflict re-reads the existing local row", async () => {
  const db = setup([], true);
  const { req, continued } = await resolve({
    userId: "user_race",
    sessionClaims: { userId: "user_race" },
  });
  assert.equal(continued, true);
  assert.equal(req.dbUser.id, "user_race");
  assert.deepEqual(db.lookups, ["user_race", "user_race"]);
});

test("missing application claim fails closed rather than creating a wrong-ID row", async () => {
  const db = setup();
  const { req, res, continued } = await resolve({ userId: "user_native", sessionClaims: {} });
  assert.equal(res.statusCode, 401);
  assert.equal(continued, false);
  assert.equal(req.dbUser, undefined);
  assert.deepEqual(db.writes, []);
  assert.deepEqual(db.lookups, []);
});

test("signed-out requests neither query nor provision, and protected routes reject them", async () => {
  const db = setup();
  const { req, res, continued } = await resolve({ userId: null });
  assert.equal(continued, true);
  requireAuthentication(req, res, () => assert.fail("Unauthorized request continued"));
  assert.equal(res.statusCode, 401);
  assert.deepEqual(db.writes, []);
  assert.deepEqual(db.lookups, []);
});
