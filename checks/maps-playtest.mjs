import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { createState, VERSION, MAPS } from "../shared/simulation.mjs";
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
const origin = process.env.CRUMBS_UI_ORIGIN || "http://127.0.0.1:4181";
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    seen = [],
    images = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (!process.env.CRUMBS_UI_ORIGIN)
    await page.route("**/api/session", (r) => {
      const b = r.request().postDataJSON();
      let seed = 1000;
      while (createState(seed).layout !== b.preferredLayout) seed++;
      return r.fulfill({
        json: {
          id: "map-preview",
          seed,
          engine: VERSION,
          layout: b.preferredLayout,
          season: 1,
        },
      });
    });
  for (let i = 0; i < 5; i++) {
    await page.goto(origin + "/app/?mode=practice");
    await page
      .getByRole("button", { name: "Start free run", exact: true })
      .waitFor();
    const name = await page.locator(".run-modal h2").innerText();
    await page
      .getByRole("button", { name: "Start free run", exact: true })
      .click();
    await page.waitForTimeout(450);
    const layout = Number(
      await page.locator("#playfield").getAttribute("data-layout"),
    );
    assert.equal(name, MAPS[layout].name);
    assert.equal(
      (await page.request.get(origin + "/game/" + MAPS[layout].floor)).status(),
      200,
    );
    assert.ok(
      !seen.includes(layout),
      "Each practice rotation must visit a different map",
    );
    seen.push(layout);
    const file = ".qa/map-" + layout + ".png";
    await page.locator("canvas").screenshot({ path: file });
    images.push({
      input: await sharp(file).resize(480, 270).png().toBuffer(),
      left: (i % 2) * 480,
      top: Math.floor(i / 2) * 270,
    });
  }
  assert.equal(new Set(seen).size, 5);
  assert.deepEqual(errors, []);
  await sharp({
    create: { width: 960, height: 810, channels: 3, background: "#121416" },
  })
    .composite(images)
    .png()
    .toFile(".qa/five-maps.png");
  write("deployments/five-maps-proof.json", {
    passed: true,
    engine: VERSION,
    origin,
    rotation: seen,
    names: seen.map((i) => MAPS[i].name),
    checks: [
      "five distinct layouts in five consecutive practice runs",
      "matching background assets loaded",
      "named map introduction",
      "no browser errors",
    ],
    checkedAt: new Date().toISOString(),
  });
  console.log("Five map layouts and backgrounds verified.");
} finally {
  await browser.close();
}
