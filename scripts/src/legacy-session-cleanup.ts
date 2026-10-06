import { pool } from "@workspace/db";

const retentionDays = 30;
const supportedEnvironments = new Set(["development", "staging", "production"]);
const tokenKeys = [
  "access_token",
  "refresh_token",
  "id_token",
  "accessToken",
  "refreshToken",
  "idToken",
];

type Mode = "preview" | "apply";

export type CleanupOptions = {
  mode: Mode;
  environment: string;
  database: string;
  expectedRows?: number;
  approvalReference?: string;
  confirmation?: string;
};

type SessionSummary = {
  total: number;
  unexpired: number;
  gracePeriod: number;
  eligible: number;
  eligibleWithTokens: number;
};

type TargetIdentity = {
  database: string;
  databaseUser: string;
  serverAddress: string | null;
  serverVersion: string;
};

type DatabaseConnection = {
  query<Row = Record<string, unknown>>(
    text: string,
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
  release(): void;
};

export function parseOptions(args: string[]): CleanupOptions {
  const [mode, ...rest] = args;
  if (mode !== "preview" && mode !== "apply") {
    throw new Error(
      "Choose preview or apply. Apply permanently deletes eligible rows from public.sessions.",
    );
  }

  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!flag.startsWith("--")) {
      throw new Error(`Unexpected argument: ${flag}`);
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (values.has(flag)) {
      throw new Error(`Repeated argument: ${flag}`);
    }
    values.set(flag, value);
    index += 1;
  }

  const allowedFlags =
    mode === "preview"
      ? new Set(["--environment", "--database"])
      : new Set([
          "--environment",
          "--database",
          "--expected-rows",
          "--approval-reference",
          "--confirm",
        ]);
  for (const flag of values.keys()) {
    if (!allowedFlags.has(flag)) {
      throw new Error(`Unsupported argument for ${mode}: ${flag}`);
    }
  }

  const environment = values.get("--environment");
  const database = values.get("--database");
  if (!environment || !database) {
    throw new Error(
      `Both --environment and --database are required for ${mode}.`,
    );
  }
  if (!supportedEnvironments.has(environment)) {
    throw new Error(
      `Unsupported environment "${environment}". Use development, staging, or production.`,
    );
  }
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{0,62}$/u.test(database)) {
    throw new Error(
      "--database must be the expected PostgreSQL database name.",
    );
  }

  if (mode === "preview") {
    return { mode, environment, database };
  }

  const expectedRowsText = values.get("--expected-rows");
  const approvalReference = values.get("--approval-reference");
  const confirmation = values.get("--confirm");
  if (
    !expectedRowsText ||
    !/^(0|[1-9]\d*)$/u.test(expectedRowsText) ||
    !approvalReference ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{2,99}$/u.test(approvalReference) ||
    confirmation !== `${environment}/${database}`
  ) {
    throw new Error(
      "Apply requires --expected-rows from the reviewed preview, --approval-reference, and --confirm <environment>/<database>.",
    );
  }
  return {
    mode,
    environment,
    database,
    expectedRows: Number(expectedRowsText),
    approvalReference,
    confirmation,
  };
}

export function validateConfiguredEnvironment(
  options: CleanupOptions,
  configuredEnvironment: string | undefined,
): void {
  if (configuredEnvironment !== options.environment) {
    throw new Error(
      `Target mismatch: --environment is "${options.environment}", but REALESTATEX_DEPLOYMENT_ENV is "${configuredEnvironment ?? "(unset)"}".`,
    );
  }
}

async function requirePool() {
  if (!pool) {
    throw new Error("DATABASE_URL is required for legacy session cleanup.");
  }
  return pool;
}

async function targetIdentity(
  connection: DatabaseConnection,
): Promise<TargetIdentity> {
  const result = await connection.query<{
    database: string;
    database_user: string;
    server_address: string | null;
    server_version: string;
  }>(
    `SELECT
       current_database() AS database,
       current_user AS database_user,
       inet_server_addr()::text AS server_address,
       current_setting('server_version') AS server_version`,
  );
  const identity = result.rows[0];
  if (!identity) {
    throw new Error("PostgreSQL did not return the target database identity.");
  }
  return {
    database: identity.database,
    databaseUser: identity.database_user,
    serverAddress: identity.server_address,
    serverVersion: identity.server_version,
  };
}

async function verifySessionsSchema(
  connection: DatabaseConnection,
): Promise<void> {
  const result = await connection.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sessions'
     ORDER BY column_name`,
  );
  const expected = [
    {
      column_name: "expire",
      data_type: "timestamp without time zone",
      is_nullable: "NO",
    },
    { column_name: "sess", data_type: "jsonb", is_nullable: "NO" },
    {
      column_name: "sid",
      data_type: "character varying",
      is_nullable: "NO",
    },
  ];
  const actual = result.rows.map((row) => ({
    column_name: row.column_name,
    data_type: row.data_type,
    is_nullable: row.is_nullable,
  }));
  if (
    actual.length !== expected.length ||
    actual.some(
      (column, index) =>
        column.column_name !== expected[index]?.column_name ||
        column.data_type !== expected[index]?.data_type ||
        column.is_nullable !== expected[index]?.is_nullable,
    )
  ) {
    throw new Error(
      `Refusing cleanup: public.sessions does not match the expected Drizzle schema (${expected.map((column) => `${column.column_name} ${column.data_type} NOT NULL`).join(", ")}). No schema changes were made.`,
    );
  }
}

export async function verifyNoSessionDeleteSideEffects(
  connection: DatabaseConnection,
): Promise<void> {
  const foreignKeys = await connection.query<{ constraint_name: string }>(
    `SELECT con.conname AS constraint_name
     FROM pg_constraint AS con
     WHERE con.contype = 'f'
       AND (
         con.conrelid = 'public.sessions'::regclass
         OR con.confrelid = 'public.sessions'::regclass
       )
     ORDER BY con.conname`,
  );
  const triggers = await connection.query<{ trigger_name: string }>(
    `SELECT tgname AS trigger_name
     FROM pg_trigger
     WHERE tgrelid = 'public.sessions'::regclass
       AND NOT tgisinternal
     ORDER BY tgname`,
  );
  if (foreignKeys.rows.length || triggers.rows.length) {
    throw new Error(
      `Refusing cleanup: public.sessions has foreign-key or trigger side effects (foreign keys: ${foreignKeys.rows.length}; user triggers: ${triggers.rows.length}). No rows were deleted.`,
    );
  }
}

const summaryQuery = `SELECT
  count(*)::int AS total,
  count(*) FILTER (
    WHERE expire >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  )::int AS unexpired,
  count(*) FILTER (
    WHERE expire < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      AND expire >= (
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '${retentionDays} days'
      )
  )::int AS grace_period,
  count(*) FILTER (
    WHERE expire < (
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '${retentionDays} days'
    )
  )::int AS eligible,
  count(*) FILTER (
    WHERE expire < (
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '${retentionDays} days'
    )
      AND sess ?| ARRAY[${tokenKeys.map((key) => `'${key}'`).join(", ")}]
  )::int AS eligible_with_tokens
FROM public.sessions`;

async function readSummary(
  connection: DatabaseConnection,
): Promise<SessionSummary> {
  const result = await connection.query<SessionSummary>(summaryQuery);
  const summary = result.rows[0];
  if (!summary) {
    throw new Error("Could not inspect public.sessions.");
  }
  return summary;
}

function printTarget(options: CleanupOptions, identity: TargetIdentity): void {
  console.log(
    `Target: environment=${options.environment}, database=${identity.database}, user=${identity.databaseUser}, server=${identity.serverAddress ?? "local socket"}, PostgreSQL=${identity.serverVersion}`,
  );
}

function printSummary(summary: SessionSummary): void {
  console.log(
    `public.sessions rows: total=${summary.total}; unexpired=${summary.unexpired}; expired within ${retentionDays}-day grace=${summary.gracePeriod}; eligible=${summary.eligible}; eligible rows with a recognized top-level OIDC token field=${summary.eligibleWithTokens}.`,
  );
  console.log(
    "No session payloads or session IDs are printed. Token-field counts are informational; eligibility depends only on expiry.",
  );
}

async function preview(
  connection: DatabaseConnection,
  options: CleanupOptions,
  identity: TargetIdentity,
): Promise<void> {
  await verifySessionsSchema(connection);
  await verifyNoSessionDeleteSideEffects(connection);
  const summary = await readSummary(connection);
  printTarget(options, identity);
  printSummary(summary);
  console.log(
    `Policy: retain every row until at least ${retentionDays} days after its UTC expiry. A preview is not approval to delete. To apply, use --expected-rows ${summary.eligible}, a recorded approval reference, and --confirm ${options.environment}/${options.database}.`,
  );
}

async function apply(
  connection: DatabaseConnection,
  options: CleanupOptions,
  identity: TargetIdentity,
): Promise<void> {
  if (options.mode !== "apply" || options.expectedRows === undefined) {
    throw new Error("Invalid apply options.");
  }
  await connection.query("BEGIN");
  try {
    await connection.query("SET LOCAL TIME ZONE 'UTC'");
    await connection.query(
      "LOCK TABLE public.sessions IN SHARE ROW EXCLUSIVE MODE",
    );
    await verifySessionsSchema(connection);
    await verifyNoSessionDeleteSideEffects(connection);
    const summary = await readSummary(connection);
    if (summary.eligible !== options.expectedRows) {
      throw new Error(
        `Preview changed: expected ${options.expectedRows} eligible row(s), found ${summary.eligible}. Nothing was deleted; run preview again.`,
      );
    }

    const deleted = await connection.query(
      `DELETE FROM public.sessions
       WHERE expire < (
         (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '${retentionDays} days'
       )
       RETURNING sid`,
    );
    const deletedCount = deleted.rowCount ?? 0;
    if (deletedCount !== options.expectedRows) {
      throw new Error(
        `Delete count mismatch: expected ${options.expectedRows}, deleted ${deletedCount}. Transaction rolled back.`,
      );
    }
    await connection.query("COMMIT");
    printTarget(options, identity);
    console.log(
      `Deleted ${deletedCount} expired legacy session row(s) from public.sessions under approval reference ${options.approvalReference}.`,
    );
    console.log(
      "The sessions table/schema, users table, foreign keys, application tables, and audit data were not modified.",
    );
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  validateConfiguredEnvironment(
    options,
    process.env.REALESTATEX_DEPLOYMENT_ENV,
  );

  const databasePool = await requirePool();
  const connection =
    (await databasePool.connect()) as unknown as DatabaseConnection;
  try {
    const identity = await targetIdentity(connection);
    if (identity.database !== options.database) {
      throw new Error(
        `Target mismatch: expected database "${options.database}", connected to "${identity.database}". No changes were made.`,
      );
    }
    if (options.mode === "preview") {
      await preview(connection, options, identity);
    } else {
      await apply(connection, options, identity);
    }
  } finally {
    connection.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith("legacy-session-cleanup.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
