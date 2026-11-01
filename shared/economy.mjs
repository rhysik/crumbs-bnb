export const TIERS = [
  { chance: 6000, low: 80123, high: 95877 },
  { chance: 3500, low: 103123, high: 107877 },
  { chance: 450, low: 110123, high: 119877 },
  { chance: 50, low: 175123, high: 224877 },
];
export const SCALE = 100000;
export const RETURN_ODDS =
  "60%: 80.123–95.877% · 35%: 103.123–107.877% · 4.5%: 110.123–119.877% · 0.5%: 175.123–224.877%";
export function expectedReturn() {
  return TIERS.reduce(
    (sum, t) => sum + ((t.chance / 10000) * (t.low + t.high)) / (2 * SCALE),
    0,
  );
}
