---
name: Contabo VPS validation
description: The release gate's rule for proving remote VPS security and recovery readiness.
---

Remote VPS readiness must be established by the fail-closed SSH runner using a secret-backed key file, strict host-key verification, and a pinned known-hosts file. Local availability of UFW, Fail2ban, or OpenSSL is not evidence about the VPS, and missing remote configuration must remain `UNVERIFIED` rather than being simulated.

**Why:** A local pass can hide a misconfigured firewall, disabled intrusion protection, invalid TLS chain, or unusable recovery script on the actual host.

**How to apply:** Keep the runner's SSH options explicit (`BatchMode`, `IdentitiesOnly`, `StrictHostKeyChecking`, `UserKnownHostsFile`) and only promote the master report when the remote UFW, Fail2ban, TLS, and recovery dry-run checks complete successfully.