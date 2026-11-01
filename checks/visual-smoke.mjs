import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { root, read, write } from "../deploy/common.mjs";
process.chdir(root);
fs.mkdirSync(".qa", { recursive: true });
const origin = read("deployments/hosting.json").previewUrl;
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
for (const [name, size] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({
    viewport: size,
    hasTouch: name === "mobile",
    isMobile: name === "mobile",
  });
  await page.goto(origin + "/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() =>
    Promise.all([...document.images].map((i) => i.decode())),
  );
  await page.screenshot({ path: ".qa/lobby-" + name + ".png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Play for BNB", exact: true }).click();
  await page
    .locator("#entry-amount")
    .filter({ hasText: "0.0028 tBNB" })
    .waitFor();
  await page.screenshot({ path: ".qa/entry-" + name + ".png", fullPage: true });
  await page.getByRole("button", { name: "Try for free" }).click();
  await page.locator("canvas").waitFor();
await page.getByRole("button", {name:"Start free run",exact:true}).click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: ".qa/game-" + name + ".png" });
  if (name === "mobile") {
    const r = await page.locator("canvas").boundingBox();
    assert(r.height > 450);
  }
  await page.close();
}
await browser.close();
write("deployments/visual-proof.json", {
  passed: true,
  checks: [
    "all lobby images decoded",
    "desktop and mobile without horizontal overflow",
    "readable mobile camera with canvas over 450px high",
    "correct entry 0.0028 tBNB",
  ],
  checkedAt: new Date().toISOString(),
});
console.log("Visual smoke passed.");
