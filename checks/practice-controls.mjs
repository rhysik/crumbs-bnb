import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { root, write } from "../deploy/common.mjs";
import { VERSION, createState } from "../shared/simulation.mjs";
process.chdir(root);
fs.mkdirSync(".qa", { recursive: true });
const origin = process.env.CRUMBS_UI_ORIGIN || "http://127.0.0.1:4181";
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
const errors = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.walletRequests = [];
      window.ethereum = {
        request: (r) => {
          window.walletRequests.push(r.method);
          throw Error("Practice must not request a wallet");
        },
      };
    });
    if (!process.env.CRUMBS_UI_ORIGIN)
      await page.route("**/api/session", async (r) => {
        const layout = r.request().postDataJSON().preferredLayout;
        let seed = 49;
        while (createState(seed).layout !== layout) seed++;
        await r.fulfill({
          json: { id: "practice-controls", seed, engine: VERSION, season: 1 },
        });
      });
    await page.goto(origin + "/");
    await page.getByRole("link", { name: "Try for free", exact: true }).click();
    await page
      .getByRole("button", { name: "Start free run", exact: true })
      .waitFor();
    await page.waitForTimeout(1300);
    assert.equal(await page.locator("#clock").innerText(), "00:45");
    await page
      .getByRole("button", { name: "Start free run", exact: true })
      .click();
    const position = async () =>
      page.locator("#playfield").evaluate((e) => ({
        x: Number(e.dataset.playerX),
        y: Number(e.dataset.playerY),
      }));
    const a = await position();
    await page
      .locator("body")
      .dispatchEvent("keydown", { key: "в", code: "KeyD", bubbles: true });
    await page.waitForTimeout(450);
    await page
      .locator("body")
      .dispatchEvent("keyup", { key: "в", code: "KeyD", bubbles: true });
    const b = await position();
    assert.ok(b.x > a.x + 20, "Russian-layout D must move right");
    await page
      .locator("body")
      .dispatchEvent("keydown", { key: "ц", code: "KeyW", bubbles: true });
    await page.waitForTimeout(400);
    await page
      .locator("body")
      .dispatchEvent("keyup", { key: "ц", code: "KeyW", bubbles: true });
    const c = await position();
    assert.ok(c.y < b.y - 15, "Russian-layout W must move up");
    assert.equal(await page.locator('[data-bit="8"]').isVisible(), true);
    await page.locator('[data-bit="8"]').click();
    await page.waitForTimeout(300);
    const d = await position();
    assert.ok(d.x > c.x + 6, "A short arrow click must visibly move the mouse");
    await page.waitForTimeout(450);
    const stopped = await position();
    assert.ok(
      Math.abs(stopped.x - d.x) < 4,
      "Released arrow must not remain stuck",
    );
    await page.locator("#pause").click();
    const clock = await page.locator("#clock").innerText();
    await page.waitForTimeout(600);
    assert.equal(await page.locator("#clock").innerText(), clock);
    await page.getByRole("button", { name: "Keep going" }).click();
    await page.screenshot({
      path: ".qa/practice-controls-" + (mobile ? "mobile" : "desktop") + ".png",
    });
    assert.deepEqual(await page.evaluate(() => window.walletRequests), []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  write("deployments/practice-controls-proof.json", {
    passed: true,
    origin,
    checks: [
      "free preview from home",
      "timer waits for Start free run",
      "Russian layout movement on physical WASD keys",
      "visible desktop and mobile arrows",
      "short arrow click moves the mouse",
      "released input does not stick",
      "pause and resume",
      "no wallet requests",
      "no horizontal overflow or browser errors",
    ],
    checkedAt: new Date().toISOString(),
  });
  console.log("Practice preview and controls passed on desktop and mobile.");
} finally {
  await browser.close();
}
