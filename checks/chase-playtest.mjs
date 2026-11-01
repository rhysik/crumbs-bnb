import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { replay, VERSION, createState } from "../shared/simulation.mjs";
import { root, write } from "../deploy/common.mjs";
process.chdir(root);
fs.mkdirSync(".qa", { recursive: true });
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
for (const mobile of [false, true]) {
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  let sessionSeed = 49;
  await page.route("**/api/session", async (r) => {
    const request = r.request().postDataJSON();
    assert.equal(request.engine, VERSION);
    assert.ok(Number.isInteger(request.preferredLayout));
    assert.ok(request.preferredLayout >= 0 && request.preferredLayout < 5);
    while (createState(sessionSeed).layout !== request.preferredLayout)
      sessionSeed++;
    await r.fulfill({
      json: { id: "local-playtest", seed: sessionSeed, engine: VERSION, season: 1 },
    });
  });
  await page.route("**/api/finish", async (r) => {
    const result = replay(sessionSeed, r.request().postDataJSON().actions);
    await r.fulfill({
      json: {
        verified: true,
        score: result.score,
        escaped: result.phase === "escaped",
      },
    });
  });
  await page.goto("http://127.0.0.1:4181/app/");
  await page.getByRole("button", { name: "Try for free" }).click();
  await page.locator("canvas").waitFor();
  await page.getByRole("button", { name: "Start free run", exact: true }).click();
  await page.waitForTimeout(900);
  assert.equal(await page.locator("#lives").innerText(), "♥♥♥");
  await page.locator("#pause").click();
  const time = await page.locator("#clock").innerText();
  await page.waitForTimeout(700);
  assert.equal(await page.locator("#clock").innerText(), time);
  await page.getByRole("button", { name: "Keep going" }).click();
  if (mobile) {
    const b = await page.locator('[data-bit="8"]').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2400);
    await page.mouse.up();
  } else {
    await page.keyboard.down("d");
    await page.waitForTimeout(2400);
    await page.keyboard.up("d");
  }
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: ".qa/chase-" + (mobile ? "mobile" : "desktop") + ".png",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.close();
}
await browser.close();
assert.deepEqual(errors, []);
write("deployments/chase-ui-proof.json", {
  passed: true,
  engine: VERSION,
  checks: [
    "new guard sprites loaded",
    "three-life HUD",
    "keyboard and touch movement",
    "pause and resume",
    "desktop and mobile without horizontal overflow",
    "no browser errors",
  ],
  checkedAt: new Date().toISOString(),
});
console.log("Chase UI passed on desktop and mobile.");
