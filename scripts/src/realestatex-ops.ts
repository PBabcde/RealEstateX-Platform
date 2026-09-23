import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
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
const freshnessHours = Number(
  process.env.BACKUP_FRESHNESS_HOURS ?? "26",
);
const realEstateXTables = [
  "properties",
  "module_data",
  "chat_sessions",
  "chat_messages",
  "audit_events",
] as const;

function offsiteBackupDirectory(): string {
  const configuredDirectory =
    process.env.REALESTATEX_OFFSITE_BACKUP_DIR ??
    process.env.REALESTATEX_BACKUP_REMOTE_DIR;
  if (!configuredDirectory) {
    throw new Error(
      "REALESTATEX_OFFSITE_BACKUP_DIR is required. Configure a durable backup location outside the application environment.",
    );
  }

  const resolvedDirectory = path.resolve(configuredDirectory);
  const relativePath = path.relative(backupDirectory, resolvedDirectory);
  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    throw new Error(
      `REALESTATEX_OFFSITE_BACKUP_DIR must be separate from REALESTATEX_BACKUP_DIR (${backupDirectory}).`,
    );
  }
  const runtimeRelativePath = path.relative(workspaceRoot, resolvedDirectory);
  if (
    runtimeRelativePath === "" ||
    (!runtimeRelativePath.startsWith("..") &&
      !path.isAbsolute(runtimeRelativePath))
  ) {
    throw new Error(
      `REALESTATEX_OFFSITE_BACKUP_DIR must be outside the application runtime (${workspaceRoot}).`,
    );
  }
  return resolvedDirectory;
}

function positiveNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

async function requireOffsiteBackupDirectory(): Promise<string> {
  const directory = offsiteBackupDirectory();
  let stat;
  try {
    stat = await fs.stat(directory);
  } catch (error) {
    throw new Error(
      `Offsite backup location ${directory} is unavailable. Mount or provision the durable storage before running backup operations.`,
      { cause: error },
    );
  }
  if (!stat.isDirectory()) {
    throw new Error(`Offsite backup location ${directory} is not a directory.`);
  }
  return directory;
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for database backups.");
  }
  return value;
}

async function pruneBackups(directory: string): Promise<number> {
  const cutoff =
    Date.now() -
    positiveNumber(retentionDays, "BACKUP_RETENTION_DAYS") *
      24 *
      60 *
      60 *
      1000;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw error;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".dump")) {
      continue;
    }
    const filename = path.join(directory, entry.name);
    const stat = await fs.stat(filename);
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(filename);
      removed += 1;
    }
  }
  return removed;
}

async function latestBackup(directory: string): Promise<string> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      entries = [];
    } else {
      throw error;
    }
  }
  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".dump"))
      .map(async (entry) => {
        const filename = path.join(directory, entry.name);
        const stat = await fs.stat(filename);
        return { filename, modifiedAt: stat.mtimeMs };
      }),
  );
  backups.sort((left, right) => right.modifiedAt - left.modifiedAt);
  if (!backups.length) {
    throw new Error(`No backup files found in ${directory}.`);
  }
  return backups[0].filename;
}

async function copyToOffsite(
  source: string,
  directory: string,
): Promise<string> {
  const target = path.join(directory, path.basename(source));
  const temporaryTarget = path.join(
    directory,
    `.${path.basename(source)}.${process.pid}.tmp`,
  );

  try {
    await fs.copyFile(source, temporaryTarget);
    const handle = await fs.open(temporaryTarget, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporaryTarget, target);
  } catch (error) {
    await fs.rm(temporaryTarget, { force: true });
    throw new Error(`Could not copy backup to ${directory}.`, { cause: error });
  }

  return target;
}

async function backup(): Promise<void> {
  const offsiteDirectory = await requireOffsiteBackupDirectory();
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
  const offsiteTarget = await copyToOffsite(target, offsiteDirectory);
  const [removedLocal, removedOffsite] = await Promise.all([
    pruneBackups(backupDirectory),
    pruneBackups(offsiteDirectory),
  ]);
  console.log(
    `Created ${target} and copied it to ${offsiteTarget}; removed ${removedLocal} local and ${removedOffsite} offsite expired backup(s).`,
  );
}

async function checkFreshness(): Promise<void> {
  const directory = await requireOffsiteBackupDirectory();
  const target = await latestBackup(directory);
  const stat = await fs.stat(target);
  const ageHours = (Date.now() - stat.mtimeMs) / (60 * 60 * 1000);
  const maxAgeHours = positiveNumber(
    freshnessHours,
    "BACKUP_FRESHNESS_HOURS",
  );
  if (ageHours > maxAgeHours) {
    throw new Error(
      `Backup freshness check failed: newest offsite backup ${target} is ${ageHours.toFixed(1)} hours old; maximum is ${maxAgeHours} hours.`,
    );
  }
  console.log(
    `Backup freshness check passed: newest offsite backup ${target} is ${ageHours.toFixed(1)} hours old.`,
  );
}

async function restoreTest(inputPath?: string): Promise<void> {
  const restoreUrl = process.env.RESTORE_DATABASE_URL;
  if (!restoreUrl) {
    throw new Error(
      "RESTORE_DATABASE_URL is required. Use a disposable PostgreSQL database, never the production database.",
    );
  }
  const target = inputPath
    ? path.resolve(inputPath)
    : await latestBackup(await requireOffsiteBackupDirectory());
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
  const target = inputPath
    ? path.resolve(inputPath)
    : await latestBackup(await requireOffsiteBackupDirectory());
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
    const offsiteDirectory = await requireOffsiteBackupDirectory();
    const [removedLocal, removedOffsite] = await Promise.all([
      pruneBackups(backupDirectory),
      pruneBackups(offsiteDirectory),
    ]);
    console.log(
      `Removed ${removedLocal} local and ${removedOffsite} offsite expired backup(s).`,
    );
    return;
  }
  if (command === "freshness-check") {
    await checkFreshness();
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
    "Usage: realestatex-ops.ts [backup|prune|freshness-check|restore-test|release-restore-test <backup-file>]",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
