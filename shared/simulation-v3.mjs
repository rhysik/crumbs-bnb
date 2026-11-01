import { clearLine, pathTo } from "./navigation.mjs";
export const VERSION = 3,
  WIDTH = 960,
  HEIGHT = 540,
  TICKS = 2700,
  STEP = 1 / 60;
export const BLOCKS = [
  { x: 230, y: 110, w: 115, h: 65 },
  { x: 520, y: 290, w: 120, h: 70 },
  { x: 690, y: 110, w: 105, h: 65 },
  { x: 300, y: 370, w: 100, h: 65 },
  { x: 440, y: 95, w: 90, h: 55 },
  { x: 740, y: 350, w: 90, h: 70 },
];
export const LAYOUTS = [
  BLOCKS,
  [
    { x: 210, y: 125, w: 115, h: 65 },
    { x: 450, y: 95, w: 100, h: 65 },
    { x: 590, y: 330, w: 120, h: 65 },
    { x: 730, y: 195, w: 100, h: 65 },
    { x: 280, y: 310, w: 95, h: 65 },
    { x: 470, y: 420, w: 85, h: 50 },
    { x: 75, y: 100, w: 80, h: 60 },
  ],
  [
    { x: 180, y: 205, w: 115, h: 65 },
    { x: 430, y: 350, w: 120, h: 65 },
    { x: 575, y: 105, w: 100, h: 65 },
    { x: 755, y: 295, w: 105, h: 65 },
    { x: 330, y: 100, w: 95, h: 55 },
    { x: 620, y: 385, w: 85, h: 65 },
  ],
  [
    { x: 245, y: 95, w: 105, h: 65 },
    { x: 460, y: 245, w: 100, h: 65 },
    { x: 660, y: 365, w: 120, h: 65 },
    { x: 765, y: 125, w: 100, h: 65 },
    { x: 325, y: 385, w: 90, h: 60 },
    { x: 100, y: 230, w: 100, h: 60 },
  ],
];
export const HOME = { x: 76, y: 440 };
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function insideBlock(x, y, r = 15, blocks = BLOCKS) {
  return blocks.some(
    (b) => x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h,
  );
}
export function createState(seed) {
  const rng = random(seed);
  const layout = Math.floor(rng() * LAYOUTS.length),
    blocks = LAYOUTS[layout].map((b) => ({ ...b }));
  const crumbs = [];
  for (let i = 0; i < 36; i++) {
    let x, y;
    do {
      x = 110 + rng() * 770;
      y = 85 + rng() * 365;
    } while (
      insideBlock(x, y, 28, blocks) ||
      Math.hypot(x - HOME.x, y - HOME.y) < 75 ||
      crumbs.some((c) => Math.hypot(x - c.x, y - c.y) < 28)
    );
    crumbs.push({ x, y, taken: false });
  }
  return {
    version: VERSION,
    layout,
    blocks,
    seed: seed >>> 0,
    tick: 0,
    phase: "playing",
    x: HOME.x,
    y: HOME.y,
    face: 1,
    carry: 0,
    collected: 0,
    hits: 0,
    hurtUntil: 0,
    dashUntil: 0,
    dashReady: 0,
    shieldUntil: 0,
    score: 0,
    crumbs,
    bots: [
      { x: 400, y: 250 },
      { x: 650, y: 220 },
      { x: 460, y: 65 },
    ].map((p, i) => ({
      ...p,
      face: -1,
      mode: "patrol",
      active: i < 2,
      alertUntil: 0,
      stunnedUntil: 0,
      route: [],
      nextPath: 0,
      patrol: [4, 3, 0][i],
      lastSeen: { ...p },
    })),
    pickups: [
      { x: 410, y: 240, kind: "shield", taken: false },
      { x: 150, y: 210, kind: "speed", taken: false },
    ],
    speedUntil: 0,
    whaleUntil: 0,
  };
}
function safeMove(s, dx, dy) {
  const nx = Math.min(WIDTH - 38, Math.max(38, s.x + dx));
  if (!insideBlock(nx, s.y, 15, s.blocks)) s.x = nx;
  const ny = Math.min(HEIGHT - 43, Math.max(60, s.y + dy));
  if (!insideBlock(s.x, ny, 15, s.blocks)) s.y = ny;
}
const patrolPoints = [
  { x: 850, y: 85 },
  { x: 600, y: 230 },
  { x: 850, y: 470 },
  { x: 450, y: 470 },
  { x: 180, y: 75 },
  { x: 460, y: 65 },
];
function updateGuards(s) {
  s.bots.forEach((guard, i) => {
    guard.active = i < 2 || s.tick >= 900;
    if (!guard.active || s.tick < guard.stunnedUntil) return;
    const visible =
      s.tick > 180 &&
      Math.hypot(s.x - HOME.x, s.y - HOME.y) > 65 &&
      Math.hypot(guard.x - s.x, guard.y - s.y) < (s.carry >= 8 ? 245 : 210) &&
      clearLine(guard, s, s.blocks, 0);
    if (visible) {
      guard.lastSeen = { x: s.x, y: s.y };
      guard.alertUntil = s.tick + 132;
      guard.mode = "chase";
    } else guard.mode = s.tick < guard.alertUntil ? "search" : "patrol";
    let target =
      guard.mode === "patrol"
        ? patrolPoints[guard.patrol % patrolPoints.length]
        : guard.lastSeen;
    if (
      guard.mode === "patrol" &&
      Math.hypot(guard.x - target.x, guard.y - target.y) < 12
    ) {
      guard.patrol++;
      target = patrolPoints[guard.patrol % patrolPoints.length];
      guard.nextPath = 0;
    }
    if (s.tick >= guard.nextPath) {
      guard.route = pathTo(guard, target, s.blocks);
      guard.nextPath = s.tick + 24 + i * 2;
    }
    const waypoint = guard.route[0];
    if (!waypoint) return;
    const dx = waypoint.x - guard.x,
      dy = waypoint.y - guard.y,
      d = Math.hypot(dx, dy);
    const speed =
      (guard.mode === "chase"
        ? 148 + i * 7
        : guard.mode === "search"
          ? 123
          : 91) * STEP;
    if (d <= speed) {
      guard.x = waypoint.x;
      guard.y = waypoint.y;
      guard.route.shift();
    } else {
      guard.x += (dx / d) * speed;
      guard.y += (dy / d) * speed;
    }
    if (Math.abs(dx) > 0.1) guard.face = dx > 0 ? 1 : -1;
  });
}
export function update(s, mask) {
  if (s.phase !== "playing") return s;
  mask = Number(mask) & 31;
  s.tick++;
  let dx = (mask & 8 ? 1 : 0) - (mask & 4 ? 1 : 0),
    dy = (mask & 2 ? 1 : 0) - (mask & 1 ? 1 : 0);
  if (dx) s.face = dx;
  if (mask & 16 && s.tick >= s.dashReady && (dx || dy)) {
    s.dashUntil = s.tick + 13;
    s.dashReady = s.tick + 180;
  }
  const moving = Math.hypot(dx, dy);
  if (moving) {
    const speed =
      s.tick < s.dashUntil ? 420 : s.tick < s.speedUntil ? 220 : 165;
    safeMove(s, (dx / moving) * speed * STEP, (dy / moving) * speed * STEP);
  }
  for (const c of s.crumbs)
    if (!c.taken && Math.hypot(s.x - c.x, s.y - c.y) < 23) {
      c.taken = true;
      s.carry++;
      s.collected++;
    }
  for (const c of s.pickups)
    if (!c.taken && Math.hypot(s.x - c.x, s.y - c.y) < 25) {
      c.taken = true;
      if (c.kind === "shield") s.shieldUntil = s.tick + 300;
      else s.speedUntil = s.tick + 300;
    }
  updateGuards(s);
  if (s.tick % 900 === 600) s.whaleUntil = s.tick + 120;
  const whale =
    s.tick < s.whaleUntil &&
    s.tick % 900 > 650 &&
    s.tick % 900 < 690 &&
    s.y > 250 &&
    s.y < 300;
  const hit =
    s.bots.some(
      (b) =>
        b.active &&
        s.tick >= b.stunnedUntil &&
        Math.hypot(b.x - s.x, b.y - s.y) < 30,
    ) || whale;
  if (
    hit &&
    s.tick >= s.hurtUntil &&
    s.tick >= s.shieldUntil &&
    s.tick >= s.dashUntil
  ) {
    s.carry = Math.floor(s.carry / 2);
    s.hits++;
    s.hurtUntil = s.tick + 110;
    for (const b of s.bots)
      if (Math.hypot(b.x - s.x, b.y - s.y) < 65) {
        b.stunnedUntil = s.tick + 90;
        b.alertUntil = 0;
        b.route = [];
        b.nextPath = 0;
      }
    if (s.hits >= 3) {
      s.phase = "caught";
      s.score = 0;
    }
  }
  if (
    s.phase === "playing" &&
    s.carry >= 8 &&
    Math.hypot(s.x - HOME.x, s.y - HOME.y) < 32
  ) {
    s.phase = "escaped";
    s.score = s.carry * 10 + Math.floor((TICKS - s.tick) / 60);
  } else if (s.tick >= TICKS) {
    s.phase = "caught";
    s.score = 0;
  }
  return s;
}
export function replay(seed, actions) {
  if (!Array.isArray(actions) || actions.length > 6000)
    throw Error("Invalid replay");
  const s = createState(seed);
  let steps = 0;
  for (const row of actions) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      !Number.isInteger(row[0]) ||
      row[0] < 0 ||
      row[0] > 31 ||
      !Number.isInteger(row[1]) ||
      row[1] < 1 ||
      row[1] > TICKS
    )
      throw Error("Invalid input");
    if (steps + row[1] > TICKS) throw Error("Replay too long");
    for (let i = 0; i < row[1]; i++) {
      if (s.phase !== "playing") throw Error("Inputs after run finished");
      update(s, row[0]);
    }
    steps += row[1];
  }
  if (s.phase === "playing") throw Error("Run is incomplete");
  return s;
}
export function encodeInput(actions, mask) {
  const last = actions.at(-1);
  if (last && last[0] === mask) last[1]++;
  else actions.push([mask, 1]);
}
export function autopilot(seed) {
  const s = createState(seed),
    actions = [];
  let target = null,
    route = [];
  for (let i = 0; i < TICKS && s.phase === "playing"; i++) {
    if (s.carry >= 8 && target !== HOME) {
      target = HOME;
      route = [];
    } else if (!target || target.taken)
      target = s.crumbs
        .filter((c) => !c.taken)
        .sort(
          (a, b) =>
            Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y),
        )[0];
    if (!route.length) route = pathTo(s, target, s.blocks);
    const point = route[0] || target;
    let x = point.x - s.x,
      y = point.y - s.y;
    if (Math.hypot(x, y) < 7) {
      route.shift();
      continue;
    }
    let mask = (x > 5 ? 8 : x < -5 ? 4 : 0) | (y > 5 ? 2 : y < -5 ? 1 : 0);
    if (s.bots.some((b) => b.active && Math.hypot(s.x - b.x, s.y - b.y) < 100))
      mask |= 16;
    const ox = s.x,
      oy = s.y;
    update(s, mask);
    encodeInput(actions, mask);
    if (Math.hypot(s.x - ox, s.y - oy) < 0.1 && s.phase === "playing") {
      route = [];
      target =
        s.crumbs
          .filter((c) => !c.taken && !insideBlock(c.x, c.y, 50, s.blocks))
          .sort(
            (a, b) =>
              Math.hypot(a.x - s.x, a.y - s.y) -
              Math.hypot(b.x - s.x, b.y - s.y),
          )[1] || HOME;
    }
  }
  return { state: s, actions };
}
