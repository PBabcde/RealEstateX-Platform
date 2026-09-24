import fs from "node:fs";
import { spawnSync } from "node:child_process";

const host = process.env.CONTABO_VPS30_HOST;
const user = process.env.CONTABO_VPS30_USER;
const keyFile = process.env.CONTABO_VPS30_SSH_KEY_FILE;
const knownHostsFile = process.env.CONTABO_VPS30_KNOWN_HOSTS_FILE;
const tlsHost = process.env.CONTABO_VPS30_TLS_HOST ?? host;
const recoveryScript = process.env.CONTABO_VPS30_RECOVERY_SCRIPT;

function stop(message: string, exitCode = 2): never {
  console.error(`CONTABO_VPS30_${exitCode === 2 ? "UNVERIFIED" : "FAIL"}: ${message}`);
  process.exit(exitCode);
}

if (!host || !user || !keyFile || !knownHostsFile || !tlsHost || !recoveryScript) {
  stop(
    "Set CONTABO_VPS30_HOST, CONTABO_VPS30_USER, CONTABO_VPS30_SSH_KEY_FILE, CONTABO_VPS30_KNOWN_HOSTS_FILE and CONTABO_VPS30_RECOVERY_SCRIPT; CONTABO_VPS30_TLS_HOST is optional.",
  );
}
if (!fs.existsSync(keyFile)) stop("The configured SSH key file does not exist.");
if (!fs.existsSync(knownHostsFile)) stop("The configured known-hosts file does not exist.");
if ((fs.statSync(keyFile).mode & 0o077) !== 0) {
  stop("The SSH key file must not be readable or writable by group or other users.");
}
if (!/^\/[A-Za-z0-9._/-]+$/.test(recoveryScript)) {
  stop("CONTABO_VPS30_RECOVERY_SCRIPT must be an absolute remote path without shell syntax.");
}

const remoteScript = `
set -Eeuo pipefail
recovery_script="$1"
tls_host="$2"

command -v ufw >/dev/null
command -v fail2ban-client >/dev/null
command -v openssl >/dev/null

ufw status verbose | grep -F "Status: active" >/dev/null
fail2ban-client ping | grep -F "pong" >/dev/null
fail2ban-client status >/dev/null

timeout 20 openssl s_client \\
  -connect "\${tls_host}:443" \\
  -servername "\${tls_host}" \\
  -verify_return_error \\
  </dev/null 2>/dev/null | grep -F "Verify return code: 0 (ok)" >/dev/null

test -x "\${recovery_script}"
"\${recovery_script}" --dry-run
printf '%s\\n' "CONTABO_VPS30_REMOTE_CHECK=PASS"
`;

const ssh = spawnSync(
  "ssh",
  [
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    `UserKnownHostsFile=${knownHostsFile}`,
    "-o",
    "ConnectTimeout=15",
    "-i",
    keyFile,
    `${user}@${host}`,
    "bash",
    "-s",
    "--",
    recoveryScript,
    tlsHost,
  ],
  {
    input: remoteScript,
    encoding: "utf8",
    timeout: 45_000,
    maxBuffer: 256 * 1024,
  },
);

const output = [ssh.stdout, ssh.stderr].filter(Boolean).join("\n").trim();
if (output) console.log(output);
if (ssh.error) stop(ssh.error.message, 1);
if (ssh.status !== 0) stop(`Remote checks exited with code ${ssh.status ?? "unknown"}.`, 1);
console.log("Contabo VPS 30 UFW, Fail2ban, TLS and recovery dry-run passed.");