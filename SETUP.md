# maw-js — Setup Guide

How to install, configure, and verify `maw-js`.

---

## Prerequisites

- **Bun** 1.3+ ([bun.sh](https://bun.sh))
- **Python** ≥ 3.11 (for some tooling scripts)
- **Git**
- **ghq** (for `maw wake org/repo` workflows)
- **tmux**
- **Docker Desktop** (recommended for full stack / federation tests)
- **`gh` CLI** (for `maw ui install` from GitHub Releases)

---

## Install

### One-line install

```bash
curl -fsSL https://raw.githubusercontent.com/Soul-Brews-Studio/maw-js/main/install.sh | bash
```

### From source

```bash
ghq get Soul-Brews-Studio/maw-js
cd "$(ghq root)/github.com/Soul-Brews-Studio/maw-js"
bun install
bun link
```

### Global package

```bash
bun add -g github:Soul-Brews-Studio/maw-js
```

---

## Configure

1. Copy the example config:

```bash
cp maw.config.example.json ~/.maw/maw.config.json
```

2. Edit `~/.maw/maw.config.json`:

```json
{
  "host": "local",
  "port": 3456,
  "ghqRoot": "/home/you/Code/github.com",
  "oracleUrl": "http://localhost:47779",
  "federationToken": "shared-secret-min-16-chars",
  "namedPeers": [
    { "name": "white", "url": "http://10.20.0.7:3456" }
  ],
  "commands": {
    "default": "claude --dangerously-skip-permissions --continue",
    "codex-*": "codex --dangerously-auto-approve --search"
  },
  "sessions": {
    "neo": "01-oracles"
  }
}
```

3. Set secrets in `env` block, not in source code:

```json
"env": {
  "CLAUDE_CODE_OAUTH_TOKEN": "<your-token>"
}
```

---

## Start the Server

```bash
maw serve              # default port 3456
maw serve 8080         # custom port
```

With Rust gateway (optional):

```bash
maw serve --gateway rust
```

---

## Install the Web UI

```bash
maw ui install           # latest release
maw ui install --version v1.15.0
maw ui status
```

Open: http://localhost:3456/federation_2d.html

---

## Verify

```bash
maw --version
maw --help
maw doctor xdg
```

Quick smoke test:

```bash
python devtools/innova-bot/scripts/smoke_test_sse.py --url http://localhost:7010/sse --timeout 3
```

(Note: maw-js API port is `3456` by default; adjust smoke URL accordingly.)

Federation probe:

```bash
maw ping
maw hey neo "hello"
```

---

## Run Tests

Default safe test suite:

```bash
bun run test
```

Isolated tests:

```bash
bun run test:isolated
```

Full local CI:

```bash
bun run test:all
```

Docker federation harness:

```bash
bash scripts/test-docker-federation.sh
```

---

## Docker

```bash
cd docker
docker compose up --build
```

Or use the project-level compose:

```bash
docker compose -f docker/compose.yml up --build
```

---

## Path Migration (XDG)

Legacy installs use `~/.maw/`. New installs can opt into XDG:

```bash
maw doctor xdg                        # show active roots
maw doctor xdg --migrate --dry-run    # preview migration
maw doctor xdg --migrate              # copy legacy artifacts forward
MAW_XDG=1 maw doctor xdg              # use spec-correct paths
```

Migration is non-destructive: it copies missing artifacts and preserves legacy sources.
