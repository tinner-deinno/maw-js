/**
 * POST /api/peer/codespace/exec — run a task on a GitHub Codespace via the
 * local Hermes relay (Jit/network/federation/codespace_relay.py).
 *
 * Auth: protected by federation HMAC (via the global federationAuth middleware)
 * just like /api/peer/exec. The relay itself is a headless Python module and
 * is spawn-seam injected for tests.
 */

import { Elysia, t } from "elysia";
import { loadConfig } from "../config";
import { spawn } from "child_process";

export interface CodespaceExecApiDeps {
  loadConfig?: typeof loadConfig;
  spawn?: typeof spawn;
}

function defaultRelayPath(): string {
  // When maw-js is running inside the Jit codespace, the relay sits next to
  // the Jit checkout at /workspaces/Jit. Outside a codespace the operator
  // sets CODESPACE_RELAY_SCRIPT or config.codespaceRelay.script.
  return process.env.CODESPACE_RELAY_SCRIPT ?? "/workspaces/Jit/network/federation/codespace_relay.py";
}

function resolveRelayScript(config: any): string {
  return (
    process.env.CODESPACE_RELAY_SCRIPT ??
    config?.codespaceRelay?.script ??
    defaultRelayPath()
  );
}

/** Run the Python relay and collect stdout/stderr/exit code. */
function runRelay(
  spawnImpl: typeof spawn,
  script: string,
  label: string,
  command: string,
  args: string[],
  workdir: string | undefined,
  timeout: number,
): Promise<{ ok: boolean; output: string; stderr: string; rc: number }> {
  const argv = [script, "run", label, command, "--timeout", String(timeout)];
  if (workdir) argv.push("--workdir", workdir);
  for (const a of args) argv.push(a);

  return new Promise((resolve) => {
    const proc = spawnImpl("python3", argv, { encoding: "utf-8" });
    let output = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk) => { output += String(chunk); });
    proc.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    proc.on("error", (err) => {
      resolve({ ok: false, output: "", stderr: err.message, rc: -1 });
    });
    proc.on("close", (rc) => {
      resolve({ ok: rc === 0, output, stderr, rc: rc ?? -1 });
    });
  });
}

export function createCodespaceExecApi(deps: CodespaceExecApiDeps = {}) {
  const load = deps.loadConfig ?? loadConfig;
  const spawnImpl = deps.spawn ?? spawn;

  const codespaceApi = new Elysia();

  codespaceApi.post("/peer/codespace/exec", async ({ body, set }) => {
    const { label, command, args = [], workdir, timeout = 150 } = body as any;

    if (!label || !command) {
      set.status = 400;
      return { error: "missing_fields", required: ["label", "command"] };
    }

    const config = load() as any;
    const script = resolveRelayScript(config);

    const result = await runRelay(
      spawnImpl,
      script,
      label,
      command,
      args,
      workdir,
      timeout,
    );

    let parsed: any;
    try {
      parsed = JSON.parse(result.output);
    } catch {
      parsed = {
        ok: result.ok,
        output: result.output,
        stderr: result.stderr,
        rc: result.rc,
        note: "relay returned non-json",
      };
    }

    if (!result.ok || parsed.ok === false) {
      set.status = 502;
    }
    return parsed;
  }, {
    body: t.Object({
      label: t.String(),
      command: t.String(),
      args: t.Optional(t.Array(t.String())),
      workdir: t.Optional(t.String()),
      timeout: t.Optional(t.Number()),
    }),
  });

  return codespaceApi;
}

export const codespaceExecApi = createCodespaceExecApi();
