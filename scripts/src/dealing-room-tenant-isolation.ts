import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireDb } from "@workspace/db";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function databaseNameFromUrl(connectionString: string): string {
  return decodeURIComponent(new URL(connectionString).pathname.slice(1));
}

function connectionStringForDatabase(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function run(
  file: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await execFileAsync(file, args, {
    cwd: root,
    env,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The tenant isolation test runner refuses to run in production.");
  }

  const sourceUrl = process.env.DATABASE_URL;
  const adminUrl = process.env.RESTORE_ADMIN_DATABASE_URL ?? sourceUrl;
  if (!sourceUrl || !adminUrl) {
    throw new Error("DATABASE_URL is required to create the disposable test database.");
  }

  const databaseName = `dealing_room_isolation_${randomUUID().replaceAll("-", "")}`;
  if (databaseNameFromUrl(adminUrl) === databaseName) {
    throw new Error("Refusing to use the configured database as the disposable test database.");
  }
  const targetUrl = connectionStringForDatabase(adminUrl, databaseName);
  const databaseIdentifier = quoteIdentifier(databaseName);
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "dealing-room-isolation-"));
  const schemaArchive = path.join(tempDirectory, "schema.dump");
  const { pool } = requireDb();
  let databaseCreated = false;
  let operationError: unknown;

  try {
    await pool.query(`CREATE DATABASE ${databaseIdentifier} TEMPLATE template0`);
    databaseCreated = true;

    await run("pg_dump", [
      "--schema-only",
      "--no-owner",
      "--no-privileges",
      "--format=custom",
      `--file=${schemaArchive}`,
      `--dbname=${sourceUrl}`,
    ]);
    await run("pg_restore", [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      `--dbname=${targetUrl}`,
      schemaArchive,
    ]);

    await run(
      path.join(root, "scripts/node_modules/.bin/tsx"),
      [path.join(root, "tests/dealing_room_tenant_isolation.test.js")],
      {
        ...process.env,
        DATABASE_URL: targetUrl,
        DEALING_ROOM_TEST_DATABASE: databaseName,
      },
    );
  } catch (error) {
    operationError = error;
  } finally {
    if (databaseCreated) {
      try {
        await pool.query(`DROP DATABASE IF EXISTS ${databaseIdentifier} WITH (FORCE)`);
      } catch (cleanupError) {
        if (operationError) {
          console.error(
            `Disposable database cleanup failed: ${
              cleanupError instanceof Error ? cleanupError.message : cleanupError
            }`,
          );
        } else {
          operationError = cleanupError;
        }
      }
    }
    await pool.end();
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }

  if (operationError) throw operationError;
  console.log("Dealing Room tenant mutation tests passed in a disposable PostgreSQL database.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});