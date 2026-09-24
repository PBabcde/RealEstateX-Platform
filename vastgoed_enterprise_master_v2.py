#!/usr/bin/env python3
"""Fail-closed, bounded-output orchestration for the Enterprise master build.

This wrapper deliberately does not make claims about remote infrastructure or
billing.  Those claims remain the responsibility of the existing TypeScript
master runner and its generated readiness report.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "script1_readiness_report.json"
COMMAND_TIMEOUT = 300
OUTPUT_LIMIT = 12_000

COMMANDS: list[tuple[str, list[str]]] = [
    (
        "OpenAPI codegen",
        ["pnpm", "--filter", "@workspace/api-spec", "run", "codegen"],
    ),
    ("Workspace typecheck", ["pnpm", "run", "typecheck"]),
    (
        "API build",
        ["pnpm", "--filter", "@workspace/api-server", "run", "build"],
    ),
    (
        "Python compileall",
        [sys.executable, "-m", "compileall", "-q", "core", "modules", "apps", "tests"],
    ),
    ("Python pytest", [sys.executable, "-m", "pytest", "tests"]),
    ("Release audit gate", ["pnpm", "run", "test:release-gate"]),
    (
        "Audit immutability",
        ["pnpm", "--filter", "@workspace/scripts", "run", "test:audit-immutability"],
    ),
    (
        "Enterprise tenant isolation",
        [
            "pnpm",
            "--filter",
            "@workspace/scripts",
            "run",
            "test:enterprise-core-tenant-isolation",
        ],
    ),
    (
        "Dealing Room tenant isolation",
        [
            "pnpm",
            "--filter",
            "@workspace/scripts",
            "run",
            "test:dealing-room-tenant-isolation",
        ],
    ),
    (
        "Enterprise tenant/security isolation",
        [
            "pnpm",
            "--filter",
            "@workspace/scripts",
            "run",
            "test:tenant-isolation",
        ],
    ),
    (
        "RAG tenant isolation",
        ["pnpm", "--filter", "@workspace/scripts", "run", "test:rag-tenant-isolation"],
    ),
    (
        "Existing enterprise master",
        ["pnpm", "run", "enterprise:master"],
    ),
]


def _secret_values() -> list[str]:
    """Return non-empty secret-like values without ever printing the environment."""
    values: list[str] = []
    for key, value in os.environ.items():
        if value and re.search(
            r"(secret|token|password|passwd|api[_-]?key|private|credential|ssh)",
            key,
            re.IGNORECASE,
        ):
            values.append(value)
    return sorted(set(values), key=len, reverse=True)


def _redact(text: str) -> str:
    for value in _secret_values():
        text = text.replace(value, "[REDACTED]")
    text = re.sub(
        r"(?i)\b((?:bearer|basic)\s+)[A-Za-z0-9._~+/=-]+",
        r"\1[REDACTED]",
        text,
    )
    text = re.sub(
        r"(?i)\b(api[_-]?key|token|secret|password)\s*[:=]\s*\S+",
        r"\1=[REDACTED]",
        text,
    )
    return text


def _bounded(text: str) -> str:
    text = _redact(text.strip())
    if len(text) <= OUTPUT_LIMIT:
        return text
    half = OUTPUT_LIMIT // 2
    return f"{text[:half]}\n...[output truncated]...\n{text[-half:]}"


def run_check(label: str, argv: list[str]) -> dict[str, Any]:
    """Run one check while draining output and retaining only a bounded sample."""
    command = " ".join(argv)
    chunks: list[str] = []
    size = 0
    status = "PASS"
    detail = "Command completed successfully."
    process: subprocess.Popen[str] | None = None
    try:
        process = subprocess.Popen(
            argv,
            cwd=ROOT,
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace",
            bufsize=1,
        )
        assert process.stdout is not None
        for line in process.stdout:
            if size < OUTPUT_LIMIT:
                chunks.append(line)
                size += len(line)
        return_code = process.wait(timeout=COMMAND_TIMEOUT)
        if return_code != 0:
            status = "FAIL"
            detail = f"Command exited with code {return_code}."
    except (OSError, subprocess.TimeoutExpired) as exc:
        status = "FAIL"
        detail = f"{type(exc).__name__}: command did not complete."
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
    if label == "Existing enterprise master" and status == "FAIL":
        report = load_report()
        checks = report.get("checks", {}) if report else {}
        if (
            report
            and report.get("contaboDecision") == "CONTABO NO-GO"
            and checks.get("failed", 0) == 0
            and checks.get("unverified", 0) > 0
        ):
            status = "BLOCKED"
            detail = (
                "The readiness runner stopped at documented external "
                "configuration gates; no local implementation checks failed."
            )
    output = _bounded("".join(chunks))
    result: dict[str, Any] = {
        "label": label,
        "status": status,
        "command": command,
        "detail": detail,
    }
    if output:
        result["output"] = output
    print(f"[{status}] {label}")
    return result


def load_report() -> dict[str, Any] | None:
    try:
        value = json.loads(REPORT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def underlying_summary(report: dict[str, Any] | None) -> dict[str, Any]:
    if report is None:
        return {
            "report": str(REPORT.relative_to(ROOT)),
            "status": "MISSING_OR_INVALID",
            "contaboDecision": "CONTABO NO-GO",
            "blockers": ["The underlying readiness report was missing or invalid."],
        }
    blockers: list[str] = []
    for phase in report.get("phases", []):
        if isinstance(phase, dict):
            for blocker in phase.get("blockers", []):
                if isinstance(blocker, str):
                    blockers.append(blocker)
    return {
        "report": str(REPORT.relative_to(ROOT)),
        "status": "READ",
        "contaboDecision": report.get("contaboDecision", "CONTABO NO-GO"),
        "readinessScore": report.get("readinessScore"),
        "script2Readiness": report.get("script2Readiness"),
        "blockers": blockers,
    }


def main() -> int:
    results = [run_check(label, argv) for label, argv in COMMANDS]
    report = load_report()
    failed_checks = [item["label"] for item in results if item["status"] == "FAIL"]
    blocked_checks = [
        item["label"] for item in results if item["status"] == "BLOCKED"
    ]
    report_view = underlying_summary(report)
    report_go = report_view.get("contaboDecision") == "CONTABO GO"
    local_checks_passed = not failed_checks
    final_status = (
        "PASS"
        if local_checks_passed and report_go
        else "BLOCKED"
        if local_checks_passed
        else "FAIL"
    )

    # This section is intentionally separate from the underlying report.  The
    # report remains authoritative and fail-closed; this wrapper only adds the
    # local orchestration outcome.
    summary = {
        "orchestration": "vastgoed_enterprise_master_v2",
        "requiredChecks": len(results),
        "failedChecks": failed_checks,
        "blockedChecks": blocked_checks,
        "localChecks": "PASS" if local_checks_passed else "FAIL",
        "underlyingReadiness": report_view,
        "finalStatus": final_status,
    }
    print("\n=== PYTHON ORCHESTRATION SUMMARY (ADDITIVE) ===")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if final_status == "PASS" else 2 if final_status == "BLOCKED" else 1


if __name__ == "__main__":
    raise SystemExit(main())