# maw-js — Study Log

Study pass started: 2026-06-18  
Scope: Understand the multi-agent workflow CLI, its architecture, federation, plugin system, and runtime boundaries.

---

## Files Read

| File | Purpose | Key Findings |
|------|---------|--------------|
| `README.md` | Project overview, install, commands, federation, plugin OS | CalVer versioning, 800+ tests, backend/frontend split, Rust gateway contract, 89 plugins |
| `package.json` | Dependencies, scripts, exports | Bun/TS ESM, version `26.6.14-alpha.2110`, workspaces `packages/*`, Elysia + Hono, React 19 UI deps, Zenoh, MQTT, Three.js |
| `src/cli.ts` | CLI entrypoint | `MAW_CLI=1`, applies `--as` preset early, auto-bootstraps plugins, dispatches commands |
| `src/config.ts` | Barrel export for config modules | Config split into `config/types`, `config/load`, `config/engine-registry`, `config/command` |
| `src/core/gateway.ts` | Gateway launcher | Selects Rust or Bun gateway; spawns child; manages backend port + readiness |
| `docs/federation.md` | Federation API reference | v1 quartet: `/api/config`, `/api/fleet-config`, `/api/feed`, `/api/federation/status`; public discovery, no auth |
| `GATEWAY_CONTRACT.md` | Rust gateway binary contract | `maw-gateway serve --port --backend --verbose`; readiness line `listening on :PORT`; narrow env allowlist |
| `maw.config.example.json` | Example runtime config | Node identity, ghq root, oracle URL, env vars, command templates, session mapping |
| `.claude/README.md` | Claude Code project hooks | PostToolUse file-size warnings (200 LOC per file), PR diff cap (300 LOC), soft non-blocking |
| `CHANGELOG.md` | Recent changes | CalVer migration, package rename `maw`→`maw-js`, JWT secret fix, federation pubkey TOFU, `/api/probe`, plugin dispatch fixes |

---

## Tech Stack

- **Runtime**: Bun 1.3+ (ESM TypeScript)
- **Backend web**: Elysia (`@elysiajs/cors`, `@elysiajs/swagger`)
- **CLI parsing**: `arg`
- **HTTP alternate**: Hono
- **UI**: React 19 + Vite + Tailwind 4 + Monaco + xterm
- **State**: Zustand
- **Type validation**: `@sinclair/typebox`
- **Transports**: tmux, SSH, HTTP, MQTT, Zenoh
- **Deployment**: pm2 (`ecosystem.config.cjs`), Docker (`docker/compose.yml`)
- **Versioning**: CalVer `v{yy}.{m}.{d}[-alpha.{HHMM}]`

---

## Architecture Notes

```
maw-js (backend + CLI)              maw-ui (frontend, separate repo)
├── src/commands/  (CLI + plugin dispatch)
├── src/api/       (engine + plugin APIs)
├── src/engine/    (WebSocket + serve proxy)
├── src/transports/ (HTTP/tmux/hub)
├── plugins        (89 vendor plugin surfaces)
├── test/          (800+ test files)
├── packages/      (workspace packages, e.g. maw-gateway Rust?)
└── install.sh
```

- **Plugin OS**: Core commands stay small; registry plugins extend surface (`fleet-ui`, `messages`, `fck`).
- **Federation**: HMAC-SHA256 signing, named peers, public v1 API quartet, pubkey TOFU.
- **Gateway**: Bun backend runs on `PORT+1`; Rust gateway owns public listener (optional).
- **Wake lifecycle**: tmux-based agent launch, snapshots, restore, `--dry-run` preview.
- **Team workspaces**: Charter YAML, isolated git worktrees, engine-agnostic `send-keys`.

---

## Gaps / Notable Observations

1. **No `CLAUDE.md` at repo root** — project relies on `.claude/README.md` and `CONTRIBUTING.md` for Claude Code guidance. This is different from other MDES repos that have a root `CLAUDE.md`.
2. **Frontend is external** — `maw-ui` lives in a separate repo (`Soul-Brews-Studio/maw-ui`) and is installed via `maw ui install`.
3. **Rust gateway in `packages/maw-gateway`** — the contract is documented but the Rust package was not opened during this pass.
4. **Test count is very large** — 800+ test files; running full suite likely requires `bun` and possibly Docker for federation tests.
5. **CalVer versioning** — alpha numbers are hour-of-day (0–23), not build counters.
6. **Public federation API is intentionally unauthenticated** — operators must not expose `/api/*` to untrusted networks.

---

## Open Questions

- What is in `packages/maw-gateway`? (Rust implementation status?)
- Which exact plugins are vendored vs registry? (README says 89 vendor plugin surfaces)
- How does the `maw-ui` frontend communicate with backend? (WebSocket? HTTP polling?)
- What is the role of `wasm/` and `bridges/` directories?
