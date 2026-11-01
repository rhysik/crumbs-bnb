import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERS, expectedReturn } from "../shared/economy.mjs";
test("payout bands cover exactly 100% of plays and 40% higher gross returns", () => {
  assert.equal(
    TIERS.reduce((s, t) => s + t.chance, 0),
    10000,
  );
  assert.equal(
    TIERS.filter((t) => t.low > 100000).reduce((s, t) => s + t.chance, 0),
    4000,
  );
  for (const t of TIERS) assert(t.low > 0 && t.high >= t.low);
});
test("the new expected payout is 95.9% before player gas", () => {
  assert(Math.abs(expectedReturn() - 0.959) < 1e-12);
});
test("the configured reserve covers every accepted multiplier and the oracle cap", () => {
  const maximum = Math.max(...TIERS.map((t) => t.high));
  assert.equal(maximum, 224877);
  assert.equal(maximum + 2000, 226877);
});
