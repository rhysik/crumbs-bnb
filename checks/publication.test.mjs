import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRead } from "../deploy/common.mjs";

test("publication recovers from a transient connection reset", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++attempts === 1) throw new TypeError("fetch failed: ECONNABORTED");
    return new Response("ready");
  });
  assert.equal(await (await fetchRead("https://example.test/health")).text(), "ready");
  assert.equal(attempts, 2);
});

test("publication retries a temporarily unavailable read", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () =>
    new Response("", { status: ++attempts === 1 ? 503 : 200 }),
  );
  assert.equal((await fetchRead("https://example.test/health")).status, 200);
  assert.equal(attempts, 2);
});

test("publication does not retry permanent failures or mutation requests", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    return new Response("missing", { status: 404 });
  });
  assert.equal((await fetchRead("https://example.test/missing")).status, 404);
  await assert.rejects(fetchRead("https://example.test/transfer", { method: "POST" }), /only support GET/);
  assert.equal(attempts, 1);
});

test("publication stops after three failed reads", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    throw new TypeError("connection reset");
  });
  await assert.rejects(fetchRead("https://example.test/health"), /connection reset/);
  assert.equal(attempts, 3);
});
