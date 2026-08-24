/**
 * curl-fetch-v3-timestamp-sync.test.ts
 *
 * Regression: curlFetch's v3 from-signing stack must reuse the SAME
 * timestamp for the base v1/v2 token signature (X-Maw-Signature) and the
 * per-peer v3 signature (X-Maw-Signature-V3). Before this fix,
 * signHeadersV3() was never given `opts.timestamp`, so it minted its own
 * independent `Date.now()` value and unconditionally overwrote
 * X-Maw-Timestamp on the shared headers object — even though the inline
 * comment claimed the timestamp was reused "by passing through" (it never
 * was). When the two Date.now() calls straddle a second boundary, the
 * final X-Maw-Timestamp on the wire no longer matches what X-Maw-Signature
 * was actually computed against, and the receiver's base-HMAC verify()
 * silently fails with signature_invalid — intermittent, not reproducible
 * on demand, exactly the "flaky federation" shape.
 *
 * Invariant under test: reconstructing sign(token, method, path, ts) using
 * the SENT X-Maw-Timestamp must equal the SENT X-Maw-Signature. This holds
 * only when both signing calls consumed the same ts.
 *
 * Isolated: mock.module() for src/config is process-global; Bun.spawn is
 * monkey-patched (curl transport) to avoid a real subprocess; Date.now is
 * monkey-patched to return distinct successive values, simulating a
 * cross-second race deterministically instead of hoping to catch one.
 */
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "path";
import type { MawConfig } from "../../src/config";
import { mockConfigModule } from "../helpers/mock-config";

const origPeerKey = process.env.MAW_PEER_KEY;
const origCurlFetchTransport = process.env.MAW_CURL_FETCH_TRANSPORT;
process.env.MAW_PEER_KEY = "ab".repeat(32);

let configStore: Partial<MawConfig> = {};

mock.module(join(import.meta.dir, "../../src/config"), () =>
  mockConfigModule(() => configStore),
);

const { curlFetch } = await import("../../src/core/transport/curl-fetch");
const { sign } = await import("../../src/lib/federation-auth");

const realSpawn = Bun.spawn;
const realDateNow = Date.now;

type SpawnProc = ReturnType<typeof Bun.spawn>;
type SpawnHandler = (args: string[]) => SpawnProc;

let spawnHandler: SpawnHandler = () => {
  throw new Error("unexpected Bun.spawn");
};

(Bun as unknown as { spawn: typeof Bun.spawn }).spawn =
  ((args: string[]) => spawnHandler(args)) as typeof Bun.spawn;

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
function textStream(parts: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encode(part));
      controller.close();
    },
  });
}
function spawnProc(opts?: { stdout?: string[]; exitCode?: number }): SpawnProc {
  return {
    stdout: textStream(opts?.stdout ?? []),
    stderr: textStream([]),
    exited: Promise.resolve(opts?.exitCode ?? 0),
    kill: () => {},
  } as unknown as SpawnProc;
}

function headerMap(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "-H") {
      const [k, ...rest] = String(args[i + 1] ?? "").split(": ");
      out[k] = rest.join(": ");
    }
  }
  return out;
}

/** Make Date.now() return a fresh, strictly-increasing second on every call
 *  — deterministically simulates the cross-second race instead of relying
 *  on real wall-clock timing to happen to straddle a boundary. */
function mockIncrementingClock(startMs: number, stepMs: number): () => void {
  let calls = 0;
  Date.now = (() => startMs + (calls++) * stepMs) as typeof Date.now;
  return () => { Date.now = realDateNow; };
}

beforeEach(() => {
  configStore = {};
  spawnHandler = () => { throw new Error("unexpected Bun.spawn"); };
  process.env.MAW_CURL_FETCH_TRANSPORT = "curl";
});

afterEach(() => {
  configStore = {};
  Date.now = realDateNow;
  if (origCurlFetchTransport === undefined) delete process.env.MAW_CURL_FETCH_TRANSPORT;
  else process.env.MAW_CURL_FETCH_TRANSPORT = origCurlFetchTransport;
});

afterAll(() => {
  Date.now = realDateNow;
  (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = realSpawn;
  if (origPeerKey === undefined) delete process.env.MAW_PEER_KEY;
  else process.env.MAW_PEER_KEY = origPeerKey;
  if (origCurlFetchTransport === undefined) delete process.env.MAW_CURL_FETCH_TRANSPORT;
  else process.env.MAW_CURL_FETCH_TRANSPORT = origCurlFetchTransport;
});

describe("curlFetch — v3 stack reuses the v2 timestamp (no cross-second race)", () => {
  test("REGRESSION: X-Maw-Timestamp on the wire matches what X-Maw-Signature was actually signed over, even across a second boundary", async () => {
    const token = "test-token-16chars!";
    configStore = { federationToken: token, oracle: "neo", node: "white" };

    // First Date.now() call (inside signHeaders) lands at second T; if
    // anything calls Date.now() again before signing finishes, it now
    // lands at T+1000ms (a full second later) — reproducing the race
    // deterministically instead of hoping real wall-clock timing hits it.
    const restoreClock = mockIncrementingClock(1_700_000_000_000, 1000);

    let seenArgs: string[] = [];
    spawnHandler = (args) => {
      seenArgs = args;
      return spawnProc({ stdout: ["{}"] });
    };

    try {
      const res = await curlFetch("http://peer.invalid/api/send", {
        method: "POST",
        body: "{}",
        from: "auto",
      });
      expect(res.ok).toBe(true);
    } finally {
      restoreClock();
    }

    const headers = headerMap(seenArgs);
    const sentTs = headers["X-Maw-Timestamp"];
    const sentSig = headers["X-Maw-Signature"];
    expect(sentTs).toBeDefined();
    expect(sentSig).toBeDefined();

    // The invariant: re-deriving the v1 signature using the TIMESTAMP THAT
    // WAS ACTUALLY SENT must reproduce the signature that was actually
    // sent. If signHeadersV3 minted its own later timestamp and overwrote
    // X-Maw-Timestamp without updating X-Maw-Signature to match, this
    // fails — exactly the intermittent signature_invalid bug.
    const expectedSig = sign(token, "POST", "/api/send", parseInt(sentTs, 10));
    expect(sentSig).toBe(expectedSig);

    // Also pin down that only ONE Date.now()-derived second was actually
    // used on the wire (v3's own timestamp, if it called Date.now() a
    // second time, would be startMs + 1000ms = one second later).
    expect(parseInt(sentTs, 10)).toBe(1_700_000_000);
  });
});
