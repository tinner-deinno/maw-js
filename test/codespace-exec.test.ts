/**
 * Tests for POST /api/peer/codespace/exec.
 */

import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { createCodespaceExecApi } from "../src/api/codespace-exec";

function makeApp(deps: Parameters<typeof createCodespaceExecApi>[0] = {}) {
  return new Elysia({ prefix: "/api" }).use(createCodespaceExecApi(deps));
}

function fakeSpawn(stdout: string, stderr = "", rc = 0): any {
  return () => {
    return {
      stdout: { on(_evt: string, cb: (chunk: any) => void) { cb(stdout); } },
      stderr: { on(_evt: string, cb: (chunk: any) => void) { cb(stderr); } },
      on(_evt: string, cb: any) {
        if (_evt === "close") setTimeout(() => cb(rc), 0);
      },
    };
  };
}

describe("POST /api/peer/codespace/exec", () => {
  test("returns relay JSON on success", async () => {
    const app = makeApp({
      loadConfig: () => ({}) as any,
      spawn: fakeSpawn(JSON.stringify({ ok: true, codespace: "nb1", output: "hello" }), "", 0),
    });

    const res = await app.handle(
      new Request("http://localhost/api/peer/codespace/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "NB1-Jit", command: "echo hello" }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.output).toBe("hello");
  });

  test("returns 400 when fields are missing", async () => {
    const app = makeApp({ loadConfig: () => ({}) as any, spawn: fakeSpawn("") });

    const res = await app.handle(
      new Request("http://localhost/api/peer/codespace/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "echo hello" }),
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    const text = await res.text();
    expect(text).toContain("label");
  });

  test("returns 502 when relay fails", async () => {
    const app = makeApp({
      loadConfig: () => ({}) as any,
      spawn: fakeSpawn(JSON.stringify({ ok: false, error: "codespace_not_in_catalog" }), "", 1),
    });

    const res = await app.handle(
      new Request("http://localhost/api/peer/codespace/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "ghost", command: "echo hi" }),
      }),
    );

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
