import { test } from "node:test";
import assert from "node:assert/strict";
import { shareRecord, shareIntent, resultSvg } from "../shared/share.mjs";
const run = {
  id: "1234567890abcdef1234567890abcdef",
  engine: 4,
  finished: 1,
  score: 152,
  crumbs: 13,
  steps: 1350,
};
test("only a verified current-game clear can create a public victory card", () => {
  assert.equal(shareRecord(run).score, 152);
  for (const bad of [
    { finished: 0 },
    { score: 0 },
    { score: 406 },
    { engine: 3 },
    { id: "<script>" },
    { crumbs: 37 },
    { steps: 2701 },
  ])
    assert.throws(() => shareRecord({ ...run, ...bad }));
});
test("X intent carries the exact arcade score, project handle and result URL", () => {
  const url = new URL(shareIntent("https://playcrumbs.xyz", run.id, 152));
  assert.equal(url.origin, "https://x.com");
  assert.equal(url.pathname, "/intent/tweet");
  assert.match(url.searchParams.get("text"), /152 points.*@playcrumbs_bnb/);
  assert.equal(
    url.searchParams.get("url"),
    `https://playcrumbs.xyz/run/${run.id}/`,
  );
  assert.doesNotMatch(url.searchParams.get("text"), /BNB won|profit|payout/i);
});
test("victory card shows the verified score and kept crumbs without a wallet address", () => {
  const svg = resultSvg(shareRecord(run), "data:image/png;base64,abc");
  assert.match(svg, />152<\/text>/);
  assert.match(svg, /36 collected · 13 kept/);
  assert.match(svg, /ARCADE POINTS/);
  assert.doesNotMatch(svg, /0x[a-f0-9]{40}/i);
});
