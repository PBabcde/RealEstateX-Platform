import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireDb } from "@workspace/db";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function databaseNameFromUrl(connectionString: string): string {
  return decodeURIComponent(new URL(connectionString).pathname.slice(1));
}

function connectionStringForDatabase(
  connectionString: string,
  databaseName: string,
): string {
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
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await execFileAsync(file, args, {
    cwd: root,
    env,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Legacy session cleanup integration tests refuse production.");
  }

  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) {
    throw new Error(
      "DATABASE_URL is required to create a disposable PostgreSQL test database.",
    );
  }

  const databaseName = `legacy_session_cleanup_${randomUUID().replaceAll("-", "")}`;
  if (databaseNameFromUrl(sourceUrl) === databaseName) {
    throw new Error("Refusing to use the configured database as the disposable test database.");
  }
  const targetUrl = connectionStringForDatabase(sourceUrl, databaseName);
  const databaseIdentifier = quoteIdentifier(databaseName);
  const { pool } = requireDb();
  let databaseCreated = false;
  let operationError: unknown;

  try {
    await pool.query(`CREATE DATABASE ${databaseIdentifier} TEMPLATE template0`);
    databaseCreated = true;

    // This pushes the real schema from lib/db/src/schema/index.ts, including auth.ts.
    await run(
      "pnpm",
      ["--filter", "@workspace/db", "run", "push"],
      { ...process.env, DATABASE_URL: targetUrl },
    );

    await run(
      path.join(root, "scripts/node_modules/.bin/tsx"),
      [path.join(root, "tests/legacy_session_cleanup_postgres.test.js")],
      {
        ...process.env,
        DATABASE_URL: targetUrl,
        LEGACY_SESSION_CLEANUP_TEST_DATABASE: databaseName,
      },
    );
  } catch (error) {
    operationError = error;
  } finally {
    if (databaseCreated) {
      try {
        await pool.query(
          `DROP DATABASE IF EXISTS ${databaseIdentifier} WITH (FORCE)`,
        );
      } catch (cleanupError) {
        if (operationError) {
          console.error(
            `Disposable database cleanup failed: ${
              cleanupError instanceof Error
                ? cleanupError.message
                : cleanupError
            }`,
          );
        } else {
          operationError = cleanupError;
        }
      }
    }
    await pool.end();
  }

  if (operationError) throw operationError;
  console.log(
    "Legacy session cleanup integration test passed in a disposable PostgreSQL database.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
