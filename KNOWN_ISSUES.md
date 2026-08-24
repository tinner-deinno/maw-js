# maw-js — Known Issues

Verified issues and documentation/behavior gaps discovered during the 2026-06-18 study pass.

---

## K-01: No root `CLAUDE.md`

**Severity**: INFO  
**Location**: repo root  
**Detail**: Unlike other MDES repos, `maw-js` has no `CLAUDE.md` at the root. Project-specific Claude Code guidance lives in `.claude/README.md` and `CONTRIBUTING.md`.  
**Impact**: Agents entering the repo for the first time may not load project-specific instructions automatically unless `.claude/README.md` is discovered.  
**Workaround**: Read `.claude/README.md` and `CONTRIBUTING.md`.  
**Fix needed**: Consider adding a root `CLAUDE.md` that points to `.claude/README.md` and project golden rules.

---

## K-02: Frontend is in a separate repo

**Severity**: LOW  
**Location**: `README.md` UI section, `maw-ui` repo  
**Detail**: The React/Vite frontend lives in `Soul-Brews-Studio/maw-ui`, not in this repo. The `maw serve` backend only serves it after `maw ui install`.  
**Impact**: New developers may expect a monorepo UI and be confused when `maw serve` has no UI out of the box.  
**Workaround**: Run `maw ui install` after server start.  
**Fix needed**: README already documents this clearly; no code fix needed.

---

## K-03: Package rename may leave stale global binary

**Severity**: MEDIUM  
**Location**: npm/bun global install path  
**Detail**: The npm package was renamed from `maw` to `maw-js` to avoid a name collision. Users with the old global `maw` package may have a stale binary.  
**Impact**: `maw: command not found` or unexpected older version.  
**Workaround**: Follow recovery runbook at `docs/install-recovery.md` — `bun add -g github:Soul-Brews-Studio/maw-js` or `bunx -p github:Soul-Brews-Studio/maw-js maw doctor`.  
**Fix needed**: Self-heal scripts exist; issue is mostly historical.

---

## K-04: Public federation API is unauthenticated

**Severity**: MEDIUM  
**Detail**: `docs/federation.md` explicitly states the v1 API quartet has **no auth (public discovery)**.  
**Impact**: If the maw server is exposed to untrusted networks, anyone can read node identity, agents map, fleet lineage, and live feed.  
**Workaround**: Run maw behind a VPN or authenticated reverse proxy; do not expose port `3456` publicly.  
**Fix needed**: Document network-hardening guidance; consider optional auth for `/api/*` in a future release.

---

## K-05: HMAC `federationToken` must be ≥16 chars but example is just illustrative

**Severity**: LOW  
**Location**: `README.md` federation example, `maw.config.example.json`  
**Detail**: The example token `shared-secret-min-16-chars` is literally the instruction text. Users may copy-paste it.  
**Impact**: Weak/default tokens across nodes enable trivial federation forgery.  
**Workaround**: Generate a strong random secret.  
**Fix needed**: Add a config validator that refuses tokens below entropy threshold or common placeholder strings.

---

## K-06: CalVer alpha hour can roll over silently

**Severity**: INFO  
**Location**: `package.json`, `CHANGELOG.md`  
**Detail**: CalVer alpha uses hour-of-day (`-alpha.{0-23}`). More than 24 releases per UTC day would collide.  
**Impact**: Rare, but CI could theoretically cut duplicate tags on a very active day.  
**Workaround**: `scripts/calver.ts` likely handles this; not investigated in this pass.

---

## K-07: Docker federation test requires Docker Desktop

**Severity**: INFO  
**Location**: `scripts/test-docker-federation.sh`, `docker/compose.yml`  
**Detail**: The cross-node smoke test spins two containers. On Windows without WSL2/Docker Desktop this may fail.  
**Impact**: Local federation verification unavailable on some Windows setups.  
**Workaround**: Run federation tests in CI or a Linux VM.  
**Fix needed**: Document Windows prerequisites.

---

## K-08: `.claude` hooks flag any Write/Edit >200 LOC without exemptions

**Severity**: LOW  
**Location**: `.claude/README.md`  
**Detail**: The file-size hook currently flags any touched file >200 LOC, not just production code. Markdown, JSON, tests, and generated files may trigger false positives.  
**Impact**: Soft warnings only, but noisy.  
**Workaround**: Override in `~/.claude/settings.json` if desired.  
**Fix needed**: Future tightening pass can add the documented exemptions.

---

## K-09: `maw.config.example.json` contains a placeholder OAuth token

**Severity**: LOW  
**Location**: `maw.config.example.json` line 8  
**Detail**: Contains `"CLAUDE_CODE_OAUTH_TOKEN": "<your-token-here>"`. This is safe as a placeholder but still worth noting.  
**Impact**: None if user replaces it.  
**Workaround**: Replace placeholder before use.  
**Fix needed**: Add a comment in the example file reminding users not to commit real tokens.
