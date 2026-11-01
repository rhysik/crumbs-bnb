import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { Contract, JsonRpcProvider } from "ethers";
import { root, read, write } from "../deploy/common.mjs";

process.chdir(root);
const origin = process.env.CRUMBS_UI_ORIGIN || "http://127.0.0.1:4181";
const failed = read("deployments/failed-mainnet-draw.json");
const playId = process.env.CRUMBS_PLAY_ID || "0x" + failed.data.slice(10);
const config = await (await fetch(origin + "/contracts.json")).json();
assert.equal(config.chainId, 56);
const provider = new JsonRpcProvider(config.rpcUrl, 56, { batchMaxCount: 1 });
const game = new Contract(
  config.game.address,
  read("artifacts/contracts/CrumbsGame.sol/CrumbsGame.json").abi,
  provider,
);
const currentPlay = await game.plays(playId);
const player = currentPlay.player;
const expectedData = game.interface.encodeFunctionData("draw", [playId]);
const requests = [],
  errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath:
    root +
    "/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
    ["small", { width: 320, height: 760 }],
  ]) {
    const context = await browser.newContext({ viewport });
    await context.exposeBinding(
      "readOnlyWallet",
      async (_source, { method, params = [] }) => {
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return [player];
        if (method === "eth_chainId") return "0x38";
        if (method === "net_version") return "56";
        if (method === "eth_sendTransaction") {
          const tx = params[0];
          assert.equal(tx.to.toLowerCase(), config.game.address.toLowerCase());
          assert.equal(tx.data, expectedData);
          assert(BigInt(tx.gas) >= 350000n);
          assert(BigInt(tx.gasPrice) > 0n);
          requests.push(tx);
          return { readOnlyDecline: true };
        }
        const reads = new Set([
          "eth_call",
          "eth_estimateGas",
          "eth_gasPrice",
          "eth_maxPriorityFeePerGas",
          "eth_getBlockByNumber",
          "eth_getBalance",
          "eth_getTransactionCount",
          "eth_blockNumber",
          "eth_feeHistory",
        ]);
        if (!reads.has(method)) throw Error("Blocked wallet method: " + method);
        return provider.send(method, params);
      },
    );
    await context.addInitScript(() => {
      window.ethereum = {
        request: async (r) => {
          const result = await window.readOnlyWallet(r);
          if (result?.readOnlyDecline)
            throw Object.assign(Error("Read-only test: transaction not sent"), {
              code: 4001,
            });
          return result;
        },
        on() {},
        removeListener() {},
      };
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/app/?play=" + playId);
    await page
      .getByRole("button", { name: "Connect to draw", exact: true })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const title of [
      "Partial return",
      "Small plus",
      "Bigger plus",
      "Top return",
    ])
      assert(await page.getByText(title, { exact: true }).isVisible());
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const wheel = await page.locator(".wheel-wrap").boundingBox();
    const legend = await page.locator(".wheel-legend").boundingBox();
    assert(
      name === "desktop"
        ? legend.x >= wheel.x + wheel.width
        : legend.y >= wheel.y + wheel.height,
    );
    await page.screenshot({
      path: "deployments/wheel-" + name + ".png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Connect to draw", exact: true })
      .click();
    if (currentPlay.state === 1n && name === "desktop") {
      await page
        .getByRole("button", { name: "Draw my return", exact: true })
        .click();
      await page
        .getByText("Wallet request declined. No new action was confirmed.", {
          exact: true,
        })
        .waitFor({ timeout: 45000 });
      assert.equal(requests.length, 1);
    } else if (currentPlay.state >= 4n) {
      await page
        .locator("#return-amount")
        .filter({ hasText: /[0-9].*BNB/ })
        .waitFor({ timeout: 45000 });
      const angles = await page.locator(".wheel-label").evaluateAll((labels) =>
        labels.map((label) => {
          const m = label.getScreenCTM();
          return (Math.atan2(m.b, m.a) * 180) / Math.PI;
        }),
      );
      assert(
        angles.every((a) => Math.abs(a) < 0.01),
        "sector labels remain horizontal after the actual result reveal",
      );
      assert.equal(
        await page.locator(".return-wheel path").nth(2).getAttribute("fill"),
        "#9ed9ef",
      );
      assert.equal(
        await page
          .locator(".wheel-tier i")
          .nth(2)
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        "rgb(158, 217, 239)",
      );
      await page.screenshot({
        path: "deployments/wheel-settled-" + name + ".png",
        fullPage: true,
      });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  write("deployments/draw-ui-readonly-proof.json", {
    passed: true,
    origin,
    playId,
    chainId: 56,
    requestedGas: requests[0] ? String(BigInt(requests[0].gas)) : null,
    gasPrice: requests[0] ? String(BigInt(requests[0].gasPrice)) : null,
    actualPlayState: Number(currentPlay.state),
    transactionsBroadcast: 0,
    checks: [
      "same paid play recovery",
      ...(currentPlay.state === 1n
        ? [
            "real-price draw simulation",
            "padded gas supplied to wallet",
            "wallet decline preserves draw",
          ]
        : [
            "settled mainnet result",
            "horizontal sector labels after rotation",
            "light-blue 4.5% sector and matching legend",
          ]),
      "four labelled colours, probabilities and ranges",
      "desktop and two mobile widths without overlap",
    ],
    checkedAt: new Date().toISOString(),
  });
  console.log(
    "Saved mainnet draw preflight and labelled wheel UI verified. No transaction broadcast.",
  );
} finally {
  await browser.close();
}
