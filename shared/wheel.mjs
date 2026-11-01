import { TIERS } from "./economy.mjs";

export const WHEEL_TIERS = TIERS.map((tier, i) => ({
  ...tier,
  label: ["Partial return", "Small plus", "Bigger plus", "Top return"][i],
  color: ["#626a6b", "#f0b90b", "#a1965c", "#fff8d7"][i],
}));

export function wheelSvg() {
  const point = (radius, angle) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return [180 + Math.cos(radians) * radius, 180 + Math.sin(radians) * radius];
  };
  let start = 0;
  const paths = WHEEL_TIERS.map((tier, i) => {
    const end = start + (tier.chance * 360) / 10000;
    const a = point(166, start),
      b = point(166, end);
    const c = point(80, end),
      d = point(80, start);
    const large = end - start > 180 ? 1 : 0;
    const path = `M${a} A166,166 0 ${large} 1 ${b} L${c} A80,80 0 ${large} 0 ${d} Z`;
    const middle = (start + end) / 2;
    start = end;
    const [x, y] = point(121, middle);
    const label =
      i < 2
        ? `<text x="${x}" y="${y}" fill="${i === 0 ? "#fffdf4" : "#121416"}" text-anchor="middle" dominant-baseline="middle" font-size="28" font-family="Lilita,Arial,sans-serif">${tier.chance / 100}%</text>`
        : "";
    return `<path d="${path}" fill="${tier.color}" stroke="#eee8d9" stroke-width="1.5"/>${label}`;
  }).join("");
  return `<svg viewBox="0 0 360 360" aria-hidden="true">${paths}<circle cx="180" cy="180" r="168" fill="none" stroke="#121416" stroke-width="5"/></svg>`;
}

export function wheelLegend() {
  return WHEEL_TIERS.map(
    (t) =>
      `<div class="wheel-tier"><i style="--tier-color:${t.color}"></i><div><strong>${t.label}</strong><span>${(t.low / 1000).toFixed(3)}–${(t.high / 1000).toFixed(3)}% of entry returned</span></div><b>${t.chance / 100}%<small>chance</small></b></div>`,
  ).join("");
}
