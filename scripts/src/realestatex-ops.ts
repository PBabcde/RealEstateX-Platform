import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const backupDirectory = path.resolve(
  process.env.REALESTATEX_BACKUP_DIR ??
    path.join(workspaceRoot, "backups", "realestateX"),
);
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? "30");
const realEstateXTables = [
  "properties",
  "module_data",
  "chat_sessions",
  "chat_messages",
  "audit_events",
] as const;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for database backups.");
  }
  return value;
}

async function pruneBackups(): Promise<number> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await fs
    .readdir(backupDirectory, { withFileTypes: true })
    .catch(() => []);
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".dump")) {
      continue;
    }
    const filename = path.join(backupDirectory, entry.name);
    const stat = await fs.stat(filename);
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(filename);
      removed += 1;
    }
  }
  return removed;
}

async function latestBackup(): Promise<string> {
  const entries = (await fs.readdir(backupDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".dump"))
    .sort((left, right) => right.name.localeCompare(left.name));
  if (!entries.length) {
    throw new Error(`No backup files found in ${backupDirectory}.`);
  }
  return path.join(backupDirectory, entries[0].name);
}

async function backup(): Promise<void> {
  await fs.mkdir(backupDirectory, { recursive: true });
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const target = path.join(backupDirectory, `realestatex-${timestamp}.dump`);
  await execFileAsync("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--file",
    target,
    databaseUrl(),
  ]);
  const removed = await pruneBackups();
  console.log(`Created ${target}; removed ${removed} expired backup(s).`);
}

async function restoreTest(inputPath?: string): Promise<void> {
  const restoreUrl = process.env.RESTORE_DATABASE_URL;
  if (!restoreUrl) {
    throw new Error(
      "RESTORE_DATABASE_URL is required. Use a disposable PostgreSQL database, never the production database.",
    );
  }
  const target = inputPath ? path.resolve(inputPath) : await latestBackup();
  await execFileAsync("pg_restore", [
    "--exit-on-error",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--dbname",
    restoreUrl,
    target,
  ]);
  console.log(`Restore test completed successfully from ${target}.`);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the release restore test.`);
  }
  return value;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseUrlForDatabase(
  adminUrl: string,
  databaseName: string,
): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function runPsql(databaseUrl: string, sql: string): Promise<string> {
  const result = await execFileAsync("psql", [
    "--no-password",
    "--no-psqlrc",
    "--dbname",
    databaseUrl,
    "--set",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--command",
    sql,
  ]);
  return result.stdout.trim();
}

async function validateRestore(databaseUrl: string): Promise<void> {
  const tableNames = realEstateXTables.map((table) => `'${table}'`).join(", ");
  const result = await runPsql(
    databaseUrl,
    `
      SELECT json_build_object(
        'tables', ARRAY(
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN (${tableNames})
          ORDER BY table_name
        ),
        'properties', (SELECT count(*) FROM public.properties),
        'moduleData', (SELECT count(*) FROM public.module_data),
        'suiteModules', (
          SELECT count(*)
          FROM public.module_data
          WHERE module_name = 'RealEstateX'
        )
      )::text;
    `,
  );

  let validation: {
    tables?: string[];
    properties?: number;
    moduleData?: number;
    suiteModules?: number;
  };
  try {
    validation = JSON.parse(result) as typeof validation;
  } catch (error) {
    throw new Error("Restore validation returned invalid PostgreSQL output.", {
      cause: error,
    });
  }

  const actualTables = validation.tables ?? [];
  const missingTables = realEstateXTables.filter(
    (table) => !actualTables.includes(table),
  );
  if (missingTables.length) {
    throw new Error(
      `Restore validation failed; missing RealEstateX table(s): ${missingTables.join(", ")}.`,
    );
  }
  if (!validation.properties || validation.properties < 1) {
    throw new Error(
      "Restore validation failed; no imported property records were found.",
    );
  }
  if (!validation.moduleData || validation.moduleData < 1) {
    throw new Error(
      "Restore validation failed; no imported module records were found.",
    );
  }
  if (!validation.suiteModules || validation.suiteModules < 1) {
    throw new Error(
      "Restore validation failed; no imported RealEstateX module records were found.",
    );
  }

  console.log(
    `Restore validation passed: ${actualTables.length} tables, ${validation.properties} properties, ${validation.moduleData} module records.`,
  );
}

async function releaseRestoreTest(inputPath?: string): Promise<void> {
  const adminUrl = requiredEnvironment("RESTORE_ADMIN_DATABASE_URL");
  const targetName = `realestatex_restore_${process.pid}_${Date.now()}`;
  const targetUrl = databaseUrlForDatabase(adminUrl, targetName);
  const targetIdentifier = quoteIdentifier(targetName);
  const target = inputPath ? path.resolve(inputPath) : await latestBackup();
  let operationError: unknown;

  try {
    await runPsql(
      adminUrl,
      `CREATE DATABASE ${targetIdentifier} TEMPLATE template0;`,
    );
    await execFileAsync("pg_restore", [
      "--exit-on-error",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--dbname",
      targetUrl,
      target,
    ]);
    await validateRestore(targetUrl);
    console.log(`Release restore test completed successfully from ${target}.`);
  } catch (error) {
    operationError = error;
  } finally {
    try {
      await runPsql(
        adminUrl,
        `DROP DATABASE IF EXISTS ${targetIdentifier} WITH (FORCE);`,
      );
    } catch (cleanupError) {
      if (operationError) {
        console.error(
          `Release restore test cleanup failed: ${
            cleanupError instanceof Error ? cleanupError.message : cleanupError
          }`,
        );
      } else {
        operationError = cleanupError;
      }
    }
  }

  if (operationError) {
    throw operationError;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "backup";
  if (command === "backup") {
    await backup();
    return;
  }
  if (command === "prune") {
    const removed = await pruneBackups();
    console.log(`Removed ${removed} expired backup(s).`);
    return;
  }
  if (command === "restore-test") {
    await restoreTest(process.argv[3]);
    return;
  }
  if (command === "release-restore-test") {
    await releaseRestoreTest(process.argv[3]);
    return;
  }
  throw new Error(
    "Usage: realestatex-ops.ts [backup|prune|restore-test|release-restore-test <backup-file>]",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
