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
  process.env.REALESTATEX_BACKUP_DIR ?? path.join(workspaceRoot, "backups", "realestateX"),
);
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? "30");

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for database backups.");
  }
  return value;
}

async function pruneBackups(): Promise<number> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(backupDirectory, { withFileTypes: true }).catch(() => []);
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
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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
  throw new Error("Usage: realestatex-ops.ts [backup|prune|restore-test <backup-file>]");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});