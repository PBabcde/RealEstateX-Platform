import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireDb } from "@workspace/db";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const name = `dealing_room_commitments_${randomUUID().replaceAll("-", "")}`;
const dbName = (url: string) => decodeURIComponent(new URL(url).pathname.slice(1));
const target = (url: string) => { const parsed = new URL(url); parsed.pathname = `/${name}`; return parsed.toString(); };
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Commitment isolation tests refuse production.");
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL is required.");
  const admin = process.env.RESTORE_ADMIN_DATABASE_URL ?? source;
  if (dbName(admin) === name) throw new Error("Refusing to use configured database.");
  const archiveDir = await fs.mkdtemp(path.join(os.tmpdir(), "commitments-isolation-"));
  const archive = path.join(archiveDir, "schema.dump");
  const { pool } = requireDb();
  let created = false;
  try {
    await pool.query(`CREATE DATABASE ${quote(name)} TEMPLATE template0`); created = true;
    await exec("pg_dump", ["--schema-only", "--no-owner", "--no-privileges", "--format=custom", `--file=${archive}`, `--dbname=${source}`], { cwd: root });
    await exec("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", `--dbname=${target(admin)}`, archive], { cwd: root });
    await exec(path.join(root, "scripts/node_modules/.bin/tsx"), [path.join(root, "tests/dealing_room_commitments.test.js")], { cwd: root, env: { ...process.env, DATABASE_URL: target(admin), DEALING_ROOM_COMMITMENTS_TEST_DATABASE: name } });
  } finally {
    if (created) await pool.query(`DROP DATABASE IF EXISTS ${quote(name)} WITH (FORCE)`);
    await pool.end();
    await fs.rm(archiveDir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });