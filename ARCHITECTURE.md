# maw-js — Architecture

High-level system map for the multi-agent workflow CLI.

---

## What maw-js Is

`maw-js` is a Bun/TypeScript CLI and API server for orchestrating multiple AI coding agents across one or many machines. It launches agents in tmux sessions, routes messages between them, exposes a federation API, and serves a web-based "lens" for visualizing the mesh.

---

## Layered Structure

```
maw-js
├── src/cli.ts              # Entrypoint: parse flags, bootstrap plugins, dispatch
├── src/cli/                # CLI helpers: usage, command registry, instance presets
├── src/commands/           # Core commands (wake, sleep, hey, peek, ls, ...)
│   ├── plugins/            # Plugin-owned commands
│   └── shared/             # Common logic: fleet, federation, wake, comm
├── src/api/                # HTTP API handlers (Elysia)
│   ├── config.ts           # GET /api/config
│   ├── fleet.ts            # GET /api/fleet-config
│   ├── feed.ts             # GET /api/feed
│   └── federation.ts       # GET /api/federation/status
├── src/engine/             # WebSocket + serve proxy for engine UIs
├── src/config/             # Config loading, engine registry, command templates
├── src/core/               # Core primitives
│   ├── consent/            # Human-in-the-loop gates
│   ├── fleet/              # Fleet config, audit, validation
│   ├── matcher/            # Target normalization and resolution
│   ├── transport/          # tmux, SSH, HTTP transports
│   ├── runtime/            # Plugin/runtime dispatch
│   └── util/               # Terminal, paths, user errors
├── src/lib/                # Shared utilities (artifacts, feed, schemas, sparkline)
├── src/plugin/             # Plugin manifest, lifecycle, registry
├── src/transports/         # Transport implementations
├── plugins/                # Bundled plugin surfaces
├── vendor-plugins/         # Vendored registry plugins
├── vendor/mpr-plugins/     # Marketplace plugin references
├── packages/               # Workspace packages (e.g. maw-gateway Rust binary)
├── test/                   # 800+ Bun test files
├── docker/                 # Docker compose + Dockerfile
└── demo/                   # Static HTML demos
```

---

## Runtime Flow

1. **CLI parse** (`src/cli.ts`)
   - Strips global flags (`--quiet`, `--silent`).
   - Applies `--as` instance preset before any path-evaluation import.
   - Logs the command via `logAudit`.

2. **Plugin bootstrap**
   - Resolves plugin directory (`~/.maw/plugins` or XDG equivalent).
   - Symlinks bundled plugins and installs from configured `pluginSources`.
   - Scans commands from the plugin directory.

3. **Auto-restore**
   - `maybeAutoRestore` recovers a previous runtime if needed.

4. **Dispatch**
   - `dispatchCommand` routes to built-in or plugin command handlers.

---

## Gateway Modes

| Mode | Public Listener | Application Server | Notes |
|------|-----------------|-------------------|-------|
| Bun (default) | Same process on `PORT` | Elysia handlers | Simplest local setup |
| Rust | `maw-gateway` on `PORT` | Bun backend on `PORT+1` | Production/performance path |

The Rust gateway contract (`GATEWAY_CONTRACT.md`) defines:
- CLI shape: `maw-gateway serve --port PORT --backend PORT [--verbose]`
- Readiness signal: stdout line `listening on :PORT`
- Environment allowlist (narrow — no secrets by default)
- Route ownership (`GET /api/health` is Rust-native)

---

## Federation

Cross-machine communication uses HMAC-SHA256 signed requests plus optional pubkey TOFU.

### Public v1 API quartet

| Endpoint | Purpose |
|----------|---------|
| `GET /api/config` | Node identity + aggregated agents map |
| `GET /api/fleet-config` | Fleet entries with lineage (`budded_from`) |
| `GET /api/feed` | Live bounded event stream |
| `GET /api/federation/status` | Peer reachability |

### Security surface

- `federationToken` shared secret minimum 16 chars.
- Optional pubkey signing (`from:` header + signature).
- TOFU: first-seen pubkey is pinned; mismatches are refused.
- Clock skew rejected at ±300s.
- Body/method/path bound to signature to prevent replay.

---

## Plugin System

`maw-js` treats itself as a plugin OS:

- **Core commands**: Small, stable CLI verbs.
- **Registry plugins**: Installable from `maw-plugin-registry` or peers.
- **Plugin manifest**: Declares CLI commands, capabilities, APIs, lifecycle hooks (`wake`, `serve`, `sleep`).
- **Serve processes**: Plugins can own browser/process UIs (`fleet-ui`, `messages`, etc.).

Plugin directories:
- `plugins/` — bundled surfaces
- `vendor-plugins/` — vendored registry plugins
- `vendor/mpr-plugins/` — marketplace references
- `~/.maw/plugins/` or XDG data dir — user-installed plugins

---

## Agent Lifecycle

```
maw wake neo        → clone repo (ghq) + create tmux session + launch engine
maw hey neo "..."   → send message to agent pane or inbox
maw peek neo        → capture/read tmux screen
maw sleep neo       → gracefully stop
maw done <window>   → auto-save + clean up worktree/branch
maw bud myname      → spawn a new oracle from a stem (creates <stem>-oracle)
```

Wake supports snapshots, dry-run previews, and engine-aware command templates (`commands` in `maw.config.json`).

---

## Team Workspaces

- **Charter YAML**: `.maw/teams/<team>.yaml` declares members, engines, worktrees, prompts.
- **Worktree isolation**: Each worker gets its own git worktree.
- **Engine agnostic**: Prompts delivered via `send-keys` so Claude Code, Codex, Aider, and OpenCode all work.

Commands:
- `maw team up <team>` — spawn from charter
- `maw team down <team>` — graceful shutdown
- `maw team reassign <member> <task>` — kill + fresh wake + redispatch

---

## Frontend (maw-ui)

The browser UI is intentionally separate:

- Repo: `Soul-Brews-Studio/maw-ui`
- Installed via `maw ui install` into `~/.maw/ui/dist/` (or XDG data dir)
- Served by `maw serve` on the same port as the API
- Reads `?host=` to point at any backend

Lens entry point: `http://localhost:3456/federation_2d.html`

---

## Transports

- **tmux**: Primary agent I/O (send keys, capture pane)
- **SSH**: Remote node access
- **HTTP**: Federation API, peer relay, proxy
- **MQTT / Zenoh**: Mesh/event networking

---

## Configuration

`maw.config.json` controls:

- `node`: local node name
- `host`/`port`: API listener
- `ghqRoot`: where `ghq` clones live
- `oracleUrl`: local Oracle knowledge base URL
- `federationToken`: shared cross-node secret
- `namedPeers`: other nodes
- `commands`: engine command templates per agent pattern
- `sessions`: session slot assignments
- `env`: environment variables passed to agents (secrets belong here, not in repo)

---

## WSE Pattern (World State Engine)

The **WSE Pattern** is Boss's mental model for separating concerns in multi-agent systems. It is **implicit** in most repos (no formal spec until 2026-08-26) but operational in canonical maw-js engine.

### Core Concept

- **Engine = World** — Engine layer holds state (NPCs, tick loop, belief revision)
- **LLM = Intelligence** — LLM layer invoked ONLY when needed (decision, score, propose)
- **Gate 10.6** — Experience → Belief → Candidate → Score → Decision → Tick 1 → Tick 2

### Token Savings

WSE pattern produces **10-100x token savings** vs. always-LLM architectures:
- LLM only invoked at belief revision or candidate scoring
- State persistence in DB, not in prompt
- Tick loop = pure function, no LLM cost per tick

### Where It Lives

- **maw-js**: Engine layer (state, tick loop, peer federation)
- **URL-Checker**: scheduler.py (WSE-like tick loop verified)
- **Not yet implemented**: bagidea-office, claude-browser-proxy (not recommended)

### Pattern Files (6-file convention)

```
ARCHITECTURE.md    — system map
KNOWN_ISSUES.md    — bugs + workarounds
RISKS.md           — operational risks
SETUP.md           — install + config
STUDY_LOG.md       — investigation log
TROUBLESHOOTING.md — recovery paths
```

Adopted 2026-06-18/19 study pass. See `WSE_REVIEW_REPORT.md` in `Jit/handoffs/2026-08-26-wse-review/` for cross-repo scores.

