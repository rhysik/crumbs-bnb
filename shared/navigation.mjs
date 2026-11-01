const graphs = new Map();
export function clearLine(a, b, blocks, radius = 17) {
  for (const box of blocks) {
    let lo = 0,
      hi = 1;
    for (const [p, d, min, max] of [
      [a.x, b.x - a.x, box.x - radius, box.x + box.w + radius],
      [a.y, b.y - a.y, box.y - radius, box.y + box.h + radius],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (p <= min || p >= max) {
          lo = 2;
          break;
        }
      } else {
        const x = (min - p) / d,
          y = (max - p) / d;
        lo = Math.max(lo, Math.min(x, y));
        hi = Math.min(hi, Math.max(x, y));
      }
      if (lo > hi) break;
    }
    if (lo <= hi) return false;
  }
  return true;
}
function graphFor(blocks) {
  const key = JSON.stringify(blocks);
  if (graphs.has(key)) return graphs.get(key);
  const nodes = blocks
    .flatMap((b) => [
      { x: b.x - 21, y: b.y - 21 },
      { x: b.x + b.w + 21, y: b.y - 21 },
      { x: b.x - 21, y: b.y + b.h + 21 },
      { x: b.x + b.w + 21, y: b.y + b.h + 21 },
    ])
    .filter(
      (p) =>
        p.x > 38 &&
        p.x < 922 &&
        p.y > 60 &&
        p.y < 497 &&
        !blocks.some(
          (b) =>
            p.x + 17 > b.x &&
            p.x - 17 < b.x + b.w &&
            p.y + 17 > b.y &&
            p.y - 17 < b.y + b.h,
        ),
    );
  const n = nodes.length;
  const dist = nodes.map((a, i) =>
    nodes.map((b, j) =>
      i === j
        ? 0
        : clearLine(a, b, blocks)
          ? Math.hypot(a.x - b.x, a.y - b.y)
          : Infinity,
    ),
  );
  const next = nodes.map((a, i) =>
    nodes.map((b, j) => (Number.isFinite(dist[i][j]) ? j : -1)),
  );
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
          next[i][j] = next[i][k];
        }
  const graph = { nodes, dist, next };
  graphs.set(key, graph);
  return graph;
}
export function pathTo(from, to, blocks) {
  const obstacle = blocks.find(
    (b) =>
      to.x + 17 > b.x &&
      to.x - 17 < b.x + b.w &&
      to.y + 17 > b.y &&
      to.y - 17 < b.y + b.h,
  );
  if (obstacle) {
    const b = obstacle,
      original = to;
    const options = [
      { x: b.x - 18, y: to.y },
      { x: b.x + b.w + 18, y: to.y },
      { x: to.x, y: b.y - 18 },
      { x: to.x, y: b.y + b.h + 18 },
    ];
    to = options
      .filter(
        (p) =>
          p.x >= 38 &&
          p.x <= 922 &&
          p.y >= 60 &&
          p.y <= 497 &&
          !blocks.some(
            (r) =>
              p.x + 17 > r.x &&
              p.x - 17 < r.x + r.w &&
              p.y + 17 > r.y &&
              p.y - 17 < r.y + r.h,
          ),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - original.x, a.y - original.y) -
          Math.hypot(b.x - original.x, b.y - original.y),
      )[0];
    if (!to) return [];
  }
  if (clearLine(from, to, blocks)) return [{ x: to.x, y: to.y }];
  const { nodes, dist, next } = graphFor(blocks);
  const starts = nodes
    .map((p, i) => ({
      i,
      d: clearLine(from, p, blocks)
        ? Math.hypot(p.x - from.x, p.y - from.y)
        : Infinity,
    }))
    .filter((p) => Number.isFinite(p.d));
  const ends = nodes
    .map((p, i) => ({
      i,
      d: clearLine(p, to, blocks)
        ? Math.hypot(p.x - to.x, p.y - to.y)
        : Infinity,
    }))
    .filter((p) => Number.isFinite(p.d));
  let best = Infinity,
    start = -1,
    end = -1;
  for (const a of starts)
    for (const b of ends) {
      const d = a.d + dist[a.i][b.i] + b.d;
      if (d < best) {
        best = d;
        start = a.i;
        end = b.i;
      }
    }
  if (start < 0) return [];
  const route = [{ ...nodes[start] }];
  for (let count = 0; start !== end && count < nodes.length; count++) {
    start = next[start][end];
    if (start < 0) return [];
    route.push({ ...nodes[start] });
  }
  route.push({ x: to.x, y: to.y });
  return route;
}
