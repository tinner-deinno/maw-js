/**
 * elysia-auth-v2-bodyhash.test.ts
 *
 * Regression for the v1/v2 signature mismatch: `federationAuth`'s
 * onBeforeHandle called `verify(token, method, path, timestamp, sig)` —
 * omitting `bodyHash` — so it always re-derived the v1 canonical string
 * (METHOD:PATH:TS) even when the request declared
 * `X-Maw-Auth-Version: v2` and was actually signed over the v2 string
 * (METHOD:PATH:TS:BODY_SHA256). A correct v2 signer was rejected with
 * 401 signature_invalid. Proven live against a running `maw serve` on
 * 2026-08-02 (see project memory: maw-federation-v1v2-auth-split) and
 * reproduced again on this branch before the fix landed.
 *
 * The companion Hono middleware in federation-auth.ts already does this
 * correctly (reads x-maw-auth-version, conditionally hashes the body) —
 * this file is the Elysia-side equivalent, since src/api/index.ts mounts
 * the Elysia plugin, not the Hono one (confirmed dead for HTTP serving;
 * only its sign/verify primitives are reused).
 *
 * Isolated: mocks src/config (mock.module is process-global) and mutates
 * the bun-server reference via setBunServer — same harness as
 * elysia-auth-global-scope.test.ts.
 */
import { describe, test, expect, mock, beforeAll, afterEach } from "bun:test";
import { join } from "path";
import { Elysia } from "elysia";
import type { MawConfig } from "../../src/config";

const root = join(import.meta.dir, "../..");

const TOKEN = "test-federation-token-min-16-chars";
let configState: Partial<MawConfig> = { node: "test-node", federationToken: TOKEN };

mock.module(join(root, "src/config"), () => {
  const { mockConfigModule } = require("../helpers/mock-config");
  return mockConfigModule(() => configState);
});

let federationAuth: typeof import("../../src/lib/elysia-auth").federationAuth;
let setBunServer: typeof import("../../src/lib/elysia-auth").setBunServer;
let sign: typeof import("../../src/lib/federation-auth").sign;
let hashBody: typeof import("../../src/lib/federation-auth").hashBody;

const NON_LOOPBACK_IP = "168.144.97.69";
const PATH = "/api/send";
const BODY = JSON.stringify({ target: "x", text: "hello" });

function buildApp(): Elysia {
  const protectedRoutes = new Elysia().post("/send", () => ({ ok: true }));
  return new Elysia({ prefix: "/api" }).use(federationAuth).use(protectedRoutes);
}

function setClientIp(address: string): void {
  setBunServer({ requestIP: () => ({ address }) } as unknown as import("bun").Server);
}

beforeAll(async () => {
  const mod = await import("../../src/lib/elysia-auth");
  federationAuth = mod.federationAuth;
  setBunServer = mod.setBunServer;
  const fa = await import("../../src/lib/federation-auth");
  sign = fa.sign;
  hashBody = fa.hashBody;
});

afterEach(() => {
  configState = { node: "test-node", federationToken: TOKEN };
});

describe("federationAuth — v2 body-hash verification", () => {
  test("REGRESSION: proper v2 signer (body-hash bound) → 200, was 401 signature_invalid pre-fix", async () => {
    setClientIp(NON_LOOPBACK_IP);
    const ts = Math.floor(Date.now() / 1000);
    const bh = hashBody(BODY);
    const sig = sign(TOKEN, "POST", PATH, ts, bh);
    const res = await buildApp().handle(
      new Request(`http://localhost${PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-maw-signature": sig,
          "x-maw-timestamp": String(ts),
          "x-maw-auth-version": "v2",
        },
        body: BODY,
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test("v2-declared with WRONG/tampered body hash → 401 signature_invalid (the attack v2 exists to stop)", async () => {
    setClientIp(NON_LOOPBACK_IP);
    const ts = Math.floor(Date.now() / 1000);
    // Signature is computed over a DIFFERENT body than the one actually sent
    // — the captured-signature/body-swap attack v2 body-binding prevents.
    const bh = hashBody(JSON.stringify({ target: "x", text: "original" }));
    const sig = sign(TOKEN, "POST", PATH, ts, bh);
    const res = await buildApp().handle(
      new Request(`http://localhost${PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-maw-signature": sig,
          "x-maw-timestamp": String(ts),
          "x-maw-auth-version": "v2",
        },
        body: JSON.stringify({ target: "x", text: "attacker-swapped-payload" }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.reason).toBe("signature_invalid");
  });

  test("no-regression: v1 sender (no X-Maw-Auth-Version header, body-less sig) still → 200", async () => {
    // This is what src/core/transport/curl-fetch.ts sends today for every
    // internal `maw` CLI call (ping/wake/send/hey/...) that does NOT pass
    // `from`. Must keep working unchanged.
    setClientIp(NON_LOOPBACK_IP);
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(TOKEN, "POST", PATH, ts); // no bodyHash -> v1
    const res = await buildApp().handle(
      new Request(`http://localhost${PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-maw-signature": sig,
          "x-maw-timestamp": String(ts),
        },
        body: BODY,
      }),
    );
    expect(res.status).toBe(200);
  });

  test("no-regression: v1-content signature labeled X-Maw-Auth-Version:v3 still → 200 (real curlFetch v3-stack shape)", async () => {
    // curlFetch's `from: "auto"` path signs the base X-Maw-Signature
    // body-less (v1) via signHeaders(), then signHeadersV3() unconditionally
    // overwrites X-Maw-Auth-Version to "v3" on the SAME header set (see
    // core/transport/curl-fetch.ts). So real cross-node traffic today
    // carries a v1-content base signature under a "v3" label. The fix must
    // treat this as exact-equals "v2" only — NOT "anything not v1" — or
    // every live v3-stacked send (mdes001<->mdes002) would start 401ing.
    setClientIp(NON_LOOPBACK_IP);
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(TOKEN, "POST", PATH, ts); // body-less, same as v1
    const res = await buildApp().handle(
      new Request(`http://localhost${PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-maw-signature": sig,
          "x-maw-timestamp": String(ts),
          "x-maw-auth-version": "v3",
        },
        body: BODY,
      }),
    );
    expect(res.status).toBe(200);
  });

  test("v2 with empty body → v1-equivalent hash, still verifies (hashBody('') === '')", async () => {
    setClientIp(NON_LOOPBACK_IP);
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(TOKEN, "POST", PATH, ts, hashBody(""));
    const res = await buildApp().handle(
      new Request(`http://localhost${PATH}`, {
        method: "POST",
        headers: {
          "x-maw-signature": sig,
          "x-maw-timestamp": String(ts),
          "x-maw-auth-version": "v2",
        },
        body: "",
      }),
    );
    expect(res.status).toBe(200);
  });
});
