import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareDraw } from "../shared/draw.mjs";
import { WHEEL_TIERS, wheelSvg, wheelLegend } from "../shared/wheel.mjs";

test("draw simulation and gas estimation use the actual transaction gas price", async () => {
  const seen = [];
  const game = {
    draw: {
      staticCall: async (id, options) => seen.push({ id, options }),
      estimateGas: async (id, options) => {
        seen.push({ id, options });
        return 220499n;
      },
    },
  };
  const provider = {
    getFeeData: async () => ({ gasPrice: 50000000n }),
    getBalance: async () => 54286800000000n,
  };
  const options = await prepareDraw(game, provider, "player", "saved-play");
  assert.equal(seen.length, 2);
  assert(
    seen.every(
      (x) =>
        x.id === "saved-play" &&
        x.options.from === "player" &&
        x.options.gasPrice === options.gasPrice,
    ),
  );
  assert.equal(options.gasLimit, 350000n);
  assert.equal(options.type, 0);
  assert(options.gasLimit > 193529n);
});

test("draw preflight stops on a reverted simulation before wallet submission", async () => {
  let estimated = false;
  const game = {
    draw: {
      staticCall: async () => {
        throw Error("already requested");
      },
      estimateGas: async () => {
        estimated = true;
      },
    },
  };
  await assert.rejects(
    prepareDraw(
      game,
      { getFeeData: async () => ({ gasPrice: 1n }) },
      "player",
      "play",
    ),
    /already requested/,
  );
  assert.equal(estimated, false);
});

test("draw preflight preserves the saved play when gas funds are insufficient", async () => {
  const game = {
    draw: { staticCall: async () => {}, estimateGas: async () => 230000n },
  };
  await assert.rejects(
    prepareDraw(
      game,
      {
        getFeeData: async () => ({ gasPrice: 50000000n }),
        getBalance: async () => 1n,
      },
      "player",
      "play",
    ),
    /Your paid entry is saved/,
  );
});

test("draw gas margin grows when the live estimate grows", async () => {
  const game = {
    draw: { staticCall: async () => {}, estimateGas: async () => 400000n },
  };
  const result = await prepareDraw(
    game,
    {
      getFeeData: async () => ({ gasPrice: 1n }),
      getBalance: async () => 1000000n,
    },
    "player",
    "play",
  );
  assert.equal(result.gasLimit, 600000n);
});

test("draw does not simulate with a zero or unavailable gas price", async () => {
  await assert.rejects(
    prepareDraw(
      {},
      { getFeeData: async () => ({ gasPrice: 0n }) },
      "player",
      "play",
    ),
    /Gas price is unavailable/,
  );
});

test("wheel colours, probabilities and labelled ranges cover the full distribution", () => {
  assert.equal(
    WHEEL_TIERS.reduce((s, t) => s + t.chance, 0),
    10000,
  );
  assert.equal(new Set(WHEEL_TIERS.map((t) => t.color)).size, 4);
  const legend = wheelLegend(),
    svg = wheelSvg();
  for (const tier of WHEEL_TIERS) {
    assert(legend.includes(tier.label));
    assert(legend.includes((tier.low / 1000).toFixed(3)));
    assert(legend.includes((tier.high / 1000).toFixed(3)));
    assert(legend.includes(tier.chance / 100 + "%"));
  }
  assert.equal((svg.match(/<path /g) || []).length, 4);
  assert(!svg.includes("NaN"));
});
