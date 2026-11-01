import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  update,
  replay,
  autopilot,
  TICKS,
  BLOCKS,
  HOME,
} from "../shared/simulation.mjs";
import { clearLine, pathTo } from "../shared/navigation.mjs";
import {
  autopilot as previousRun,
  replay as previousReplay,
} from "../shared/simulation-v2.mjs";
test("already-open version 2 runs still have their original replay verifier", () => {
  const r = previousRun(1);
  assert.equal(previousReplay(1, r.actions).score, r.state.score);
  assert.equal(r.state.version, 2);
});
test("guards see the mouse, chase it and lose sight behind an obstacle", () => {
  const s = createState(4);
  s.blocks = [];
  s.pickups = [];
  s.tick = 200;
  s.x = 400;
  s.y = 230;
  s.bots[0].x = 520;
  s.bots[0].y = 230;
  const before = Math.hypot(s.x - s.bots[0].x, s.y - s.bots[0].y);
  update(s, 0);
  assert.equal(s.bots[0].mode, "chase");
  assert.ok(Math.hypot(s.x - s.bots[0].x, s.y - s.bots[0].y) < before);
  s.x = 100;
  s.y = 450;
  for (let i = 0; i < 150; i++) update(s, 0);
  assert.equal(s.bots[0].mode, "patrol");
});
test("navigation routes around crates instead of walking through them", () => {
  const blocks = [{ x: 200, y: 180, w: 120, h: 110 }],
    a = { x: 150, y: 230 },
    b = { x: 380, y: 230 };
  assert.equal(clearLine(a, b, blocks), false);
  const route = pathTo(a, b, blocks);
  assert.ok(route.length >= 3);
  let previous = a;
  for (const point of route) {
    assert.ok(clearLine(previous, point, blocks));
    previous = point;
  }
  assert.deepEqual(route.at(-1), b);
});
test("green crumbs provide five seconds of speed and let the mouse break a chase", () => {
  const s = createState(4);
  s.blocks = [];
  s.tick = 181;
  s.x = 150;
  s.y = 100;
  s.bots = s.bots.slice(0, 1);
  s.bots[0].x = 110;
  s.bots[0].y = 100;
  s.pickups = [{ x: 150, y: 100, kind: "speed", taken: false }];
  update(s, 0);
  assert.equal(s.speedUntil, s.tick + 300);
  const x = s.x;
  update(s, 8);
  assert.ok(s.x - x > 4);
  for (let i = 0; i < 180; i++) update(s, 8);
  assert.ok(Math.hypot(s.x - s.bots[0].x, s.y - s.bots[0].y) > 210);
  assert.notEqual(s.bots[0].mode, "chase");
  assert.equal(s.hits, 0);
});
test("all five arenas have distinct obstacles and reachable gold crumbs and boosts", () => {
  const layouts = new Map();
  for (let seed = 1; seed <= 100; seed++) {
    const s = createState(seed);
    layouts.set(s.layout, JSON.stringify(s.blocks));
    assert.equal(s.pickups.filter((p) => p.kind === "speed").length, 3);
    for (const target of [...s.crumbs, ...s.pickups])
      assert.ok(pathTo(s, target, s.blocks).length > 0);
  }
  assert.equal(layouts.size, 5);
  assert.equal(new Set(layouts.values()).size, 5);
});
test("three catches end the arcade run and another guard joins after fifteen seconds", () => {
  const s = createState(1);
  s.crumbs = [];
  s.pickups = [];
  s.tick = 181;
  s.x = 400;
  s.y = 250;
  assert.equal(s.bots[2].active, false);
  for (let i = 0; i < 3; i++) {
    const b = s.bots[0];
    b.x = s.x;
    b.y = s.y;
    b.stunnedUntil = 0;
    s.hurtUntil = 0;
    update(s, 0);
  }
  assert.equal(s.hits, 3);
  assert.equal(s.phase, "caught");
  assert.equal(s.score, 0);
  const t = createState(2);
  t.tick = 899;
  update(t, 0);
  assert.equal(t.bots[2].active, true);
});
test("guards remain outside collision geometry throughout a full run", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = createState(seed);
    for (let i = 0; i < TICKS && s.phase === "playing"; i++) {
      update(s, i % 160 < 80 ? 8 : 4);
      for (const b of s.bots)
        assert.ok(
          !s.blocks.some(
            (r) =>
              b.x + 16 > r.x &&
              b.x - 16 < r.x + r.w &&
              b.y + 16 > r.y &&
              b.y - 16 < r.y + r.h,
          ),
        );
    }
  }
});
test("same seed and inputs reproduce every result", () => {
  const a = createState(7),
    b = createState(7);
  for (let i = 0; i < 700; i++) {
    const m = i < 100 ? 8 : i < 220 ? 1 : i < 350 ? 4 : 2;
    update(a, m);
    update(b, m);
  }
  assert.deepEqual(a, b);
});
test("movement respects walls and map boundaries", () => {
  const s = createState(5);
  for (let i = 0; i < 400; i++) update(s, 4);
  assert(s.x >= 38);
  s.x = s.blocks[0].x - 16;
  s.y = s.blocks[0].y + 20;
  for (let i = 0; i < 30; i++) update(s, 8);
  assert(s.x <= s.blocks[0].x - 15);
});
test("collectibles cannot be claimed twice", () => {
  const s = createState(6);
  s.x = s.crumbs[0].x;
  s.y = s.crumbs[0].y;
  update(s, 0);
  const count = s.carry;
  update(s, 0);
  assert.equal(s.carry, count);
  assert(count >= 1);
});
test("a hit loses half the carried crumbs, with a grace period", () => {
  const s = createState(3);
  s.x = 400;
  s.y = 400;
  s.crumbs = [];
  s.pickups = [];
  s.carry = 9;
  update(s, 0);
  s.x = s.bots[0].x;
  s.y = s.bots[0].y;
  update(s, 0);
  assert.equal(s.carry, 4);
  const hits = s.hits;
  update(s, 0);
  assert.equal(s.hits, hits);
});
test("the last crumb ends the run immediately without returning home", () => {
  const s = createState(2);
  s.bots = [];
  s.pickups = [];
  s.collected = 35;
  s.carry = 35;
  s.crumbs.forEach((c, i) => (c.taken = i !== 35));
  s.x = s.crumbs[35].x;
  s.y = s.crumbs[35].y;
  assert.ok(Math.hypot(s.x - HOME.x, s.y - HOME.y) > 75);
  update(s, 0);
  assert.equal(s.phase, "escaped");
  assert.equal(s.collected, 36);
  assert(s.score >= 360 && s.score <= 404);
  const old = s.tick;
  update(s, 8);
  assert.equal(s.tick, old);
});
test("time runs out, and invalid replays cannot enter leaderboards", () => {
  const s = createState(1);
  for (let i = 0; i < TICKS; i++) update(s, 0);
  assert.equal(s.phase, "caught");
  assert.equal(s.score, 0);
  assert.throws(() => replay(1, [[0, TICKS + 1]]));
  assert.throws(() => replay(1, [[32, 2]]));
  assert.throws(() => replay(1, [[8, 1]]));
});
test("automated valid play can escape and replay the recorded inputs", () => {
  let found;
  for (let seed = 1; seed < 60; seed++) {
    const r = autopilot(seed);
    if (r.state.phase === "escaped") {
      found = { ...r, seed };
      break;
    }
  }
  assert(found, "At least one reachable seed should escape");
  const result = replay(found.seed, found.actions);
  assert.equal(result.score, found.state.score);
  assert.equal(result.phase, "escaped");
});

test("maps vary by seed while collectibles stay outside collision geometry", () => {
  const layouts = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const s = createState(seed);
    layouts.add(s.layout);
    for (const c of s.crumbs)
      assert(
        !s.blocks.some(
          (b) =>
            c.x + 28 > b.x &&
            c.x - 28 < b.x + b.w &&
            c.y + 28 > b.y &&
            c.y - 28 < b.y + b.h,
        ),
      );
  }
  assert.equal(layouts.size, 5);
});
