# maw-js — Troubleshooting

Common problems and recovery steps.

---

## T-01: `maw: command not found`

**Symptom**: Shell cannot find `maw` after install or update.
**Cause**: npm/bun name collision, failed update, stale global package, or PATH issue.
**Fix**:

```bash
# One-shot reinstall
bun add -g github:Soul-Brews-Studio/maw-js

# Self-heal without reinstalling globally
bunx -p github:Soul-Brews-Studio/maw-js maw doctor

# Or restore from stashed previous binary
~/.bun/bin/maw.prev --version
```

Full runbook: `docs/install-recovery.md`.

---

## T-02: `maw serve` fails to start

**Symptom**: Server exits immediately or port conflict.
**Cause**: Port 3456 already in use, missing `maw.config.json`, or plugin bootstrap failure.
**Fix**:

1. Check port:

```bash
lsof -i :3456
```

2. Use a different port:

```bash
maw serve 8080
```

3. Verify config exists and is valid JSON:

```bash
cat ~/.maw/maw.config.json
maw doctor xdg
```

---

## T-03: UI returns 404

**Symptom**: `http://localhost:3456/federation_2d.html` is 404.
**Cause**: `maw-ui` frontend not installed.
**Fix**:

```bash
maw ui install
maw ui status
```

Restart `maw serve` after install.

---

## T-04: Federation messages not delivered to peer

**Symptom**: `maw hey white:neo "hello"` times out or pane does not update.
**Cause**: Peer URL wrong, token mismatch, firewall, tmux session not running on peer, or clock skew.
**Fix**:

1. Verify peer config on both nodes:

```bash
maw ping
```

2. Check token length (≥16 chars) and that both nodes use the same token.
3. Verify tmux session exists on target:

```bash
tmux ls
```

4. Check `GET /api/federation/status` for peer reachability.
5. Ensure system clocks are within ±300s.

---

## T-05: `maw wake neo` fails

**Symptom**: Agent does not start or repo not cloned.
**Cause**: Missing `ghq`, wrong `ghqRoot`, repo not accessible, or engine command template error.
**Fix**:

1. Verify `ghq` is installed:

```bash
which ghq
ghq list
```

2. Check `ghqRoot` in `maw.config.json` matches `ghq root` output.
3. Test engine command manually:

```bash
claude --dangerously-skip-permissions --continue /path/to/repo
```

4. Use `--dry-run` to preview the wake plan:

```bash
maw wake neo --dry-run
```

---

## T-06: Plugin command not found

**Symptom**: `maw fleet-ui serve` returns unknown command.
**Cause**: Plugin not installed, not enabled, or dispatch fallback not matching.
**Fix**:

```bash
maw plugin ls
maw plugin install fleet-ui
maw plugin enable fleet-ui
```

Check plugin has an `entry` or `wasm` surface so it is dispatchable.

---

## T-07: Tests fail with `bun: command not found`

**Symptom**: Any `bun run test:*` script fails.
**Cause**: Bun not installed or not on PATH.
**Fix**:

```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
```

---

## T-08: Docker federation test fails

**Symptom**: `scripts/test-docker-federation.sh` exits nonzero.
**Cause**: Docker not running, compose version mismatch, or port conflict.
**Fix**:

```bash
docker compose version
docker ps
bash scripts/test-docker-federation.sh
```

For a persistent two-node stack:

```bash
bash scripts/dev-federation.sh up
```

---

## T-09: Rust gateway not starting

**Symptom**: `maw serve --gateway rust` hangs or exits.
**Cause**: `maw-gateway` binary not built or not on PATH, or readiness signal mismatch.
**Fix**:

1. Build the Rust package:

```bash
cd packages/maw-gateway
cargo build --release
```

2. Ensure binary is on PATH or set `MAW_GATEWAY_BIN`.
3. Check stdout for `listening on :3456` readiness line.

---

## T-10: JWT auth errors after upgrade

**Symptom**: API returns 401/403 after updating maw.
**Cause**: Newer versions generate a random JWT secret on first run; legacy config may have stale secret.
**Fix**:

```bash
# Show current secret location
maw doctor xdg

# Remove old secret and restart to regenerate (safe — only affects local auth)
rm ~/.maw/auth-secret
maw serve
```

Or set `MAW_JWT_SECRET` explicitly.

---

## General Diagnostic

Run this checklist before asking for help:

1. `maw --version` works
2. `bun --version` ≥ 1.3
3. `~/.maw/maw.config.json` is valid JSON
4. `maw doctor xdg` shows expected paths
5. `maw serve` starts on expected port
6. `maw ui install` succeeded (if using UI)
7. Target tmux session exists (for wake/hey)
8. Federation token matches across peers
9. Clocks within ±300s across peers
10. Firewall allows port `3456` (or custom port) between nodes
