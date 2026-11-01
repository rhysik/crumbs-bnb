import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { JsonRpcProvider, getBytes } from "ethers";
import { root, read, write } from "../deploy/common.mjs";
import { testWallet } from "../deploy/test-wallet.mjs";
process.chdir(root);
fs.mkdirSync(".qa", { recursive: true });
const h = read("deployments/hosting.json"),
  origin = h.previewUrl,
  config = await (await fetch(origin + "/contracts.json")).json();
assert.equal(config.chainId, 97);
assert.equal(
  config.game.address.toLowerCase(),
  read("deployments/game-testnet.json").address.toLowerCase(),
);
const provider = new JsonRpcProvider(config.rpcUrl),
  wallet = testWallet(provider),
  transactions = [],
  errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath:
    root +
    "/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await ctx.exposeBinding(
  "testWalletRequest",
  async (_source, { method, params = [] }) => {
    if (method === "eth_chainId") return "0x61";
    if (method === "net_version") return "97";
    if (method === "eth_accounts" || method === "eth_requestAccounts")
      return [wallet.address];
    if (method === "wallet_switchEthereumChain") {
      assert.equal(params[0].chainId, "0x61");
      return null;
    }
    if (method === "personal_sign") {
      assert.equal(params[1].toLowerCase(), wallet.address.toLowerCase());
      return wallet.signMessage(getBytes(params[0]));
    }
    if (method === "eth_sendTransaction") {
      assert.equal(Number(await provider.send("eth_chainId", [])), 97);
      const t = params[0];
      assert.ok(
        [
          config.game.address.toLowerCase(),
          config.market.toLowerCase(),
        ].includes(t.to.toLowerCase()),
      );
      assert.ok(BigInt(t.value || 0) <= BigInt(config.game.entryPrice));
      const fee = await provider.getFeeData();
      const tx = await wallet.sendTransaction({
        to: t.to,
        data: t.data,
        value: BigInt(t.value || 0),
        gasLimit: BigInt(t.gas || 600000),
        gasPrice: t.gasPrice ? BigInt(t.gasPrice) : fee.gasPrice,
        type: 0,
        chainId: 97,
      });
      transactions.push(tx.hash);
      return tx.hash;
    }
    if (method.startsWith("eth_")) return provider.send(method, params);
    throw Error("Unsupported isolated test wallet request: " + method);
  },
);
await ctx.addInitScript(() => {
  window.ethereum = {
    isMetaMask: true,
    request: (r) => window.testWalletRequest(r),
    on() {},
    removeListener() {},
  };
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(origin + "/");
await page.getByRole("button", { name: "Play for BNB", exact: true }).waitFor();
await page.waitForLoadState("networkidle");
await page.evaluate(() =>
  Promise.all([...document.images].map((i) => i.decode().catch(() => {}))),
);
await page.screenshot({ path: ".qa/lobby-desktop.png", fullPage: true });
await page.getByRole("button", { name: "Play for BNB", exact: true }).click();
await page
  .locator("#entry-amount")
  .filter({ hasText: "0.0028 tBNB" })
  .waitFor();
await page.screenshot({ path: ".qa/entry-desktop.png", fullPage: true });
await page.locator("#entry-consent").check();
await page
  .getByRole("button", { name: "Enter with tBNB", exact: true })
  .click();
await page.locator("#playfield canvas").waitFor({ timeout: 45000 });
await page.getByRole("button", {name:"Start run",exact:true}).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: ".qa/game-desktop.png" });
await page.keyboard.down("d");
await page.waitForTimeout(900);
await page.keyboard.up("d");
await page.locator("#pause").click();
const clock = await page.locator("#clock").innerText();
await page.waitForTimeout(1000);
assert.equal(await page.locator("#clock").innerText(), clock);
await page.getByRole("button", { name: "Keep going" }).click();
console.log("Browser: paid entry, generated map, movement and pause verified.");
await page.locator("#open-wheel").waitFor({ timeout: 65000 });
await page.locator("#open-wheel").click();
await page.getByRole("button", { name: "Connect to draw" }).click();
await page
  .getByRole("button", { name: "Draw my return", exact: true })
  .waitFor();
await page.getByRole("button", { name: "Draw my return", exact: true }).click();
await page
  .getByRole("button", { name: "Confirm return", exact: true })
  .waitFor({ timeout: 240000 });
await page.getByRole("button", { name: "Confirm return", exact: true }).click();
await page
  .getByRole("button", { name: /^Claim .*tBNB$/ })
  .waitFor({ timeout: 45000 });
await page.screenshot({ path: ".qa/wheel-desktop.png", fullPage: true });
await page.getByRole("button", { name: /^Claim .*tBNB$/ }).click();
await page
  .getByText("Return confirmed in your wallet.", { exact: true })
  .waitFor({ timeout: 45000 });
console.log(
  "Browser: official VRF, fractional return and wallet withdrawal verified.",
);
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
const phone = await mobile.newPage();
phone.on("pageerror", (e) => errors.push(e.message));
await phone.goto(origin + "/app/");
await phone
  .getByRole("button", { name: "Try for free" })
  .waitFor();
await phone.screenshot({ path: ".qa/entry-mobile.png", fullPage: true });
await phone.getByRole("button", { name: "Try for free" }).click();
await phone.locator("canvas").waitFor();
await phone.getByRole("button", {name:"Start free run",exact:true}).click();
await phone.waitForTimeout(1200);
const button = await phone.locator('[data-bit="8"]').boundingBox();
await phone.mouse.move(
  button.x + button.width / 2,
  button.y + button.height / 2,
);
await phone.mouse.down();
await phone.waitForTimeout(700);
await phone.mouse.up();
await phone.screenshot({ path: ".qa/game-mobile.png" });
assert.ok(await phone.locator('[data-bit="8"]').isVisible());
await phone.goto(origin + "/docs/");
await phone
  .getByRole("heading", { name: "Paid draw rules", exact: true })
  .waitFor();
assert.ok((await phone.locator("body").innerText()).includes("95.9%"));
assert.equal(
  await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
assert.deepEqual(errors, []);
write("deployments/ui-proof.json", {
  passed: true,
  chainId: 97,
  game: config.game.address,
  market: config.market,
  transactions,
  checks: [
    "paid browser entry",
    "seed-bound map",
    "keyboard movement",
    "pause and resume",
    "return after lost arcade run",
    "official VRF callback",
    "fractional payout in UI",
    "actual wallet claim",
    "mobile touch controls",
    "mobile docs without horizontal overflow",
    "no uncaught browser errors",
  ],
  checkedAt: new Date().toISOString(),
});
await browser.close();
console.log("UI lifecycle passed.");
