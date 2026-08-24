# maw-js — Risk Register

Risks identified during documentation study. Severity and likelihood are rough estimates based on current architecture and docs.

---

## R-01: Public federation API is unauthenticated

| Field | Value |
|-------|-------|
| Risk | The v1 federation quartet (`/api/config`, `/api/fleet-config`, `/api/feed`, `/api/federation/status`) is intentionally public discovery with no auth. Exposing `maw serve` to untrusted networks leaks node identity, agent names, fleet lineage, and live events. |
| Severity | MEDIUM |
| Likelihood | MEDIUM |
| Mitigation | Run maw behind a VPN or authenticated reverse proxy. Do not expose port `3456` to the public internet. Add network-hardening runbook. |

---

## R-02: Federation token may be weak or copy-pasted

| Field | Value |
|-------|-------|
| Risk | `maw.config.example.json` and README examples use illustrative tokens. Operators may reuse them. A weak `federationToken` allows cross-node request forgery. |
| Severity | MEDIUM |
| Likelihood | MEDIUM |
| Mitigation | Add a startup validator that rejects tokens below length/entropy thresholds or known placeholder strings. Document secret generation command. |

---

## R-03: Plugin OS expands attack surface

| Field | Value |
|-------|-------|
| Risk | Plugins can declare CLI commands, APIs, lifecycle hooks, and `serve` processes. A malicious or compromised plugin gains the same runtime privileges as the maw CLI. |
| Severity | MEDIUM |
| Likelihood | LOW-MEDIUM |
| Mitigation | Install plugins only from trusted sources; review plugin manifests before enabling; use the consent/ACL layer for destructive commands; keep vendored plugins pinned. |

---

## R-04: Secrets in `env` block of config file

| Field | Value |
|-------|-------|
| Risk | `maw.config.json` stores secrets such as `CLAUDE_CODE_OAUTH_TOKEN`. The file may be accidentally committed or world-readable. |
| Severity | MEDIUM |
| Likelihood | LOW |
| Mitigation | Ensure `~/.maw/` has restrictive permissions (`0700`). Avoid committing config files. Consider moving secrets to a keyring or env var indirection. |

---

## R-05: CalVer alpha hour collision

| Field | Value |
|-------|-------|
| Risk | CalVer alpha suffix is hour-of-day (0–23). On an extremely active release day, more than 24 alpha cuts could collide. |
| Severity | LOW |
| Likelihood | LOW |
| Mitigation | Verify `scripts/calver.ts` handles rollover or switch to minute/build counter if release cadence increases. |

---

## R-06: tmux pane injection can run arbitrary code

| Field | Value |
|-------|-------|
| Risk | `maw hey` delivers messages by sending keys to an agent's tmux pane. A compromised peer with a valid federation token can inject keystrokes into a running agent session. |
| Severity | MEDIUM |
| Likelihood | LOW |
| Mitigation | Scope ACL (`scope-acl.ts`) and consent gates are designed to mitigate this but are not yet fully wired into `comm-send.ts` per CHANGELOG. Complete the ACL integration and enable human approval for cross-oracle commands. |

---

## R-07: Large test suite is expensive to run

| Field | Value |
|-------|-------|
| Risk | 800+ test files plus Docker federation tests can be slow and flaky in constrained environments. Contributors may skip tests. |
| Severity | LOW |
| Likelihood | MEDIUM |
| Mitigation | Maintain tiered test commands (`test:default:safe`, `test:isolated`, `test:mock-smoke`) so CI and local dev can run appropriate subsets. |

---

## R-08: Rust gateway build complexity

| Field | Value |
|-------|-------|
| Risk | The production gateway path depends on a Rust binary in `packages/maw-gateway`. If the Rust toolchain or build is not maintained, the recommended production path degrades to the Bun gateway. |
| Severity | LOW |
| Likelihood | LOW |
| Mitigation | Add CI build gate for `packages/maw-gateway` and document how to verify the binary. |

---

## R-09: External UI dependency

| Field | Value |
|-------|-------|
| Risk | The UI ships from `maw-ui` repo. Version skew between backend and frontend can break lens features. |
| Severity | LOW |
| Likelihood | MEDIUM |
| Mitigation | `maw ui install --version` pins frontend version; document compatible backend/frontend versions. |

---

## R-10: No root `CLAUDE.md`

| Field | Value |
|-------|-------|
| Risk | Without a root `CLAUDE.md`, agents may not load project-specific instructions automatically. Safety rules (e.g., destructive-op gates) are less discoverable. |
| Severity | LOW |
| Likelihood | LOW |
| Mitigation | Add a concise root `CLAUDE.md` that links to `.claude/README.md`, `CONTRIBUTING.md`, and project golden rules. |
