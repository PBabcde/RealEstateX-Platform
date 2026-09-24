import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type CheckStatus = "PASS" | "PARTIAL" | "FAIL" | "UNVERIFIED";
type PhaseStatus = "PASS" | "PARTIAL" | "FAIL";

type Check = {
  name: string;
  status: CheckStatus;
  detail: string;
  command?: string;
  output?: string;
};

type Phase = {
  phase: string;
  name: string;
  status: PhaseStatus;
  checks: Check[];
  blockers: string[];
};

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const reportPath = path.resolve(
  process.env.ENTERPRISE_REPORT_PATH ??
    path.join(workspaceRoot, "script1_readiness_report.json"),
);
const maxOutputLength = 4_000;

function trimOutput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxOutputLength
    ? `${trimmed.slice(0, maxOutputLength)}\n...[output truncated]`
    : trimmed;
}

function commandString(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function runCommand(
  name: string,
  command: string,
  args: string[],
  extraEnv?: Record<string, string>,
): Check {
  const invocation = commandString(command, args);
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const output = trimOutput(
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );

  if (result.error) {
    return {
      name,
      status: "FAIL",
      detail: result.error.message,
      command: invocation,
      output,
    };
  }
  if (result.status === 0) {
    return {
      name,
      status: "PASS",
      detail: "Command completed successfully.",
      command: invocation,
      output,
    };
  }
  return {
    name,
    status: "FAIL",
    detail: `Command exited with code ${result.status ?? "unknown"}.`,
    command: invocation,
    output,
  };
}

function fileCheck(
  name: string,
  relativePath: string,
  detailWhenPresent: string,
): Check {
  const exists = fs.existsSync(path.join(workspaceRoot, relativePath));
  return {
    name,
    status: exists ? "PASS" : "FAIL",
    detail: exists
      ? detailWhenPresent
      : `Required path is missing: ${relativePath}`,
  };
}

function toolCheck(name: string, tool: string): Check {
  const result = spawnSync("bash", ["-lc", `command -v ${tool}`], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
  return {
    name,
    status: result.status === 0 ? "PASS" : "UNVERIFIED",
    detail:
      result.status === 0
        ? `${tool} is available in the local environment.`
        : `${tool} is not available locally; VPS configuration was not verified.`,
  };
}

function phaseStatus(checks: Check[], blockers: string[]): PhaseStatus {
  if (checks.some((check) => check.status === "FAIL") || blockers.length) {
    return "FAIL";
  }
  if (
    checks.some(
      (check) => check.status === "PARTIAL" || check.status === "UNVERIFIED",
    )
  ) {
    return "PARTIAL";
  }
  return "PASS";
}

function createPhase(
  phase: string,
  name: string,
  checks: Check[],
  blockers: string[] = [],
): Phase {
  return {
    phase,
    name,
    status: phaseStatus(checks, blockers),
    checks,
    blockers,
  };
}

function phase1(): Phase {
  const checks = [
    fileCheck(
      "Trust source classes",
      "artifacts/api-server/src/lib/enterprise-core.ts",
      "Enterprise Core trust source classes are defined.",
    ),
    fileCheck(
      "RBAC and tenant context",
      "artifacts/api-server/src/lib/enterprise-core-access.ts",
      "Authenticated tenant and role context is available.",
    ),
    fileCheck(
      "Append-only audit enforcement",
      "lib/db/drizzle/0003_audit_append_only_chain.sql",
      "Database append-only audit migration is present.",
    ),
    fileCheck(
      "Recovery controls",
      "artifacts/api-server/src/lib/enterprise-core-middleware.ts",
      "Recovery mode guard is present.",
    ),
    fileCheck(
      "Contabo VPS 30 security runner",
      "scripts/src/contabo-vps30-runner.ts",
      "The VPS 30 runner uses a pinned known-hosts file and a secret-backed SSH key hook.",
    ),
    runCommand("Workspace typecheck", "pnpm", ["run", "typecheck"]),
    runCommand("API build", "pnpm", [
      "--filter",
      "@workspace/api-server",
      "run",
      "build",
    ]),
    runCommand("Release audit gate", "pnpm", ["run", "test:release-gate"]),
    runCommand("Audit immutability test", "pnpm", [
      "--filter",
      "@workspace/scripts",
      "run",
      "test:audit-immutability",
    ]),
    runCommand("Enterprise Core tenant test", "pnpm", [
      "--filter",
      "@workspace/scripts",
      "run",
      "test:enterprise-core-tenant-isolation",
    ]),
  ];

  const contaboConfigured = [
    process.env.CONTABO_VPS30_HOST,
    process.env.CONTABO_VPS30_USER,
    process.env.CONTABO_VPS30_SSH_KEY_FILE,
    process.env.CONTABO_VPS30_KNOWN_HOSTS_FILE,
    process.env.CONTABO_VPS30_RECOVERY_SCRIPT,
  ].every(Boolean);
  if (contaboConfigured) {
    checks.push(
      runCommand(
        "Contabo VPS 30 UFW, Fail2ban, TLS and recovery dry-run",
        "pnpm",
        ["--filter", "@workspace/scripts", "run", "contabo:vps30"],
      ),
    );
  } else {
    checks.push({
      name: "Contabo VPS 30 UFW, Fail2ban, TLS and recovery dry-run",
      status: "UNVERIFIED",
      detail:
        "No approved VPS host, SSH key-file hook, pinned known-hosts file and explicit recovery-script path were configured; the runner did not connect.",
    });
  }

  const remoteCheck = checks[checks.length - 1];
  const blockers =
    remoteCheck?.status === "PASS"
      ? []
      : [
          "A Contabo VPS 30 runner result is required; local tooling cannot prove the remote firewall, Fail2ban, TLS or recovery state.",
        ];
  return createPhase("Fase 1", "Enterprise Core & Security", checks, blockers);
}

function phaseCapability(
  phase: string,
  name: string,
  expectedPaths: string[],
  blockers: string[],
): Phase {
  const checks = expectedPaths.map((expectedPath) =>
    fileCheck(
      `${name} implementation`,
      expectedPath,
      `${name} implementation path is present.`,
    ),
  );
  const missing = checks.some((check) => check.status === "FAIL");
  return createPhase(phase, name, checks, missing ? blockers : []);
}

function phase8(): Phase {
  const checks = [
    fileCheck(
      "SaaS tier entitlements",
      "artifacts/api-server/src/lib/saas-entitlements.ts",
      "Tier limits and feature entitlements are defined.",
    ),
    fileCheck(
      "SaaS billing adapter",
      "artifacts/api-server/src/lib/billing-hooks.ts",
      "Provider-neutral billing readiness hook is defined.",
    ),
  ];
  const provider = process.env.BILLING_PROVIDER?.toLowerCase();
  const webhookReady =
    (provider === "stripe" || provider === "whop") &&
    Boolean(process.env.BILLING_WEBHOOK_SECRET);
  checks.push({
    name: "Billing provider and webhook",
    status: webhookReady ? "PASS" : "UNVERIFIED",
    detail: webhookReady
      ? `Billing provider ${provider} and webhook secret are configured.`
      : "No supported billing provider and webhook secret were configured through the secure environment flow.",
  });
  return createPhase("Fase 8", "SaaS & tiering", checks, webhookReady ? [] : [
    "SaaS tiering is implemented, but a real Stripe or Whop billing provider and webhook secret are not configured.",
  ]);
}

function buildPhases(): Phase[] {
  return [
    phase1(),
    createPhase("Fase 2", "Dealing Room MVP", [
      fileCheck(
        "Dealing Room API and PDF",
        "artifacts/api-server/src/routes/deals.ts",
        "Deal routes and investor-ready PDF generation are implemented.",
      ),
      fileCheck(
        "Deal Score Engine",
        "artifacts/api-server/src/lib/deal-score.ts",
        "Deal Score Engine is implemented.",
      ),
      fileCheck(
        "Investor-ready PDF",
        "artifacts/api-server/src/lib/investor-ready-sheet.ts",
        "Investor-ready PDF generation is implemented.",
      ),
      runCommand("Authenticated Dealing Room tenant isolation", "pnpm", [
        "--filter",
        "@workspace/scripts",
        "run",
        "test:dealing-room-tenant-isolation",
      ]),
    ]),
    phaseCapability(
      "Fase 3",
      "Energy integratie",
      ["artifacts/api-server/src/lib/energy-analysis.ts"],
      [
        "No persisted property-to-energy-to-ROI workflow is present.",
      ],
    ),
    phaseCapability(
      "Fase 4",
      "Subsidies module",
      ["artifacts/api-server/src/lib/subsidy-engine.ts"],
      [
        "No persisted subsidy-trigger and net-ROI module is present.",
      ],
    ),
    phaseCapability(
      "Fase 5",
      "Investor Room",
      ["artifacts/api-server/src/routes/investors.ts"],
      [
        "Investor profiles, interests, risk profiles and budgets are not implemented.",
      ],
    ),
    phaseCapability(
      "Fase 6",
      "Matching Engine",
      ["artifacts/api-server/src/lib/investor-matching.ts"],
      [
        "Deal-to-investor top-10 matching is not implemented.",
      ],
    ),
    phaseCapability(
      "Fase 7",
      "CRM integratie",
      ["artifacts/api-server/src/routes/crm.ts"],
      [
        "CRM entities and communication history are not implemented.",
      ],
    ),
    phase8(),
  ];
}

function countChecks(phases: Phase[]): {
  total: number;
  passed: number;
  partial: number;
  failed: number;
  unverified: number;
} {
  const checks = phases.flatMap((phase) => phase.checks);
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "PASS").length,
    partial: checks.filter((check) => check.status === "PARTIAL").length,
    failed: checks.filter((check) => check.status === "FAIL").length,
    unverified: checks.filter((check) => check.status === "UNVERIFIED").length,
  };
}

function main(): void {
  const phases = buildPhases();
  const counts = countChecks(phases);
  const readinessScore =
    counts.total === 0
      ? 0
      : Math.round(
          ((counts.passed + counts.partial * 0.5) / counts.total) * 100,
        );
  const phase1Status = phases[0].status;
  const allLaterPhasesComplete = phases
    .slice(1)
    .every((phase) => phase.status === "PASS");
  const contaboDecision =
    phase1Status === "PASS" &&
    allLaterPhasesComplete &&
    readinessScore > 90
      ? "CONTABO GO"
      : "CONTABO NO-GO";

  const report = {
    reportType: "vastgoed-enterprise-master-build",
    generatedAt: new Date().toISOString(),
    script: "Vastgoed_Enterprise_Master_Build.sh",
    mode: "fail-closed",
    readinessScore,
    requestedThreshold: ">90%",
    thresholdMet: readinessScore > 90,
    contaboDecision,
    script2Readiness: allLaterPhasesComplete
      ? "READY"
      : "NOT READY",
    checks: counts,
    phases,
    limitations: [
      "Local execution cannot prove Contabo VPS 30 firewall, Fail2ban, TLS or recovery state.",
      "Billing cannot be validated live until a provider integration is connected and provider-specific checkout/webhook configuration is supplied.",
      "Tenant-isolation endpoint checks use authenticated test principals against the real routers and database, not a production identity-provider session.",
    ],
    nextActions: [
      "Connect Stripe or Whop through the Replit integration flow, then implement and verify its checkout, webhooks and subscription sync.",
      "Configure the pinned Contabo host, secret-backed SSH-key path, known-hosts file and approved recovery dry-run path through secure environment settings.",
      "Run the master build again after provider and VPS configuration are supplied.",
    ],
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Readiness report written to ${reportPath}`);
  console.log(`Readiness score: ${readinessScore}% (required: >90%)`);
  console.log(`Contabo decision: ${contaboDecision}`);
  console.log(`Script 2 readiness: ${report.script2Readiness}`);

  if (contaboDecision !== "CONTABO GO") {
    process.exitCode = 1;
  }
}

main();