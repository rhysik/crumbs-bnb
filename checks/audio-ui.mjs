import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { VERSION, createState } from "../shared/simulation.mjs";
import { root, write } from "../deploy/common.mjs";
process.chdir(root);
const origin = process.env.CRUMBS_UI_ORIGIN || "http://127.0.0.1:4181";
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
      window.soundStarts = [];
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args) {
        window.soundStarts.push(this.frequency.value);
        return start.apply(this, args);
      };
    });
    if (!process.env.CRUMBS_UI_ORIGIN)
      await page.route("**/api/session", (r) => {
        let seed = 1;
        while (
          createState(seed).layout !==
          r.request().postDataJSON().preferredLayout
        )
          seed++;
        return r.fulfill({
          json: { id: "audio-check", seed, engine: VERSION, season: 1 },
        });
      });
    await page.goto(origin + "/app/?mode=practice");
    await page
      .getByRole("button", { name: "Start free run", exact: true })
      .waitFor();
    assert.equal(
      await page.locator("audio").count(),
      0,
      "no music before a gesture",
    );
    await page
      .getByRole("button", { name: "Start free run", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("audio")?.currentTime > 0.2,
    );
    const music = () =>
      page
        .locator("audio")
        .evaluate((a) => ({
          paused: a.paused,
          time: a.currentTime,
          ready: a.readyState,
        }));
    assert.equal((await music()).paused, false);
    assert(
      (await music()).ready >= 2,
      "music must decode, not merely load a URL",
    );
    await page.keyboard.down("d");
    await page.locator("#dash").click();
    await page.waitForTimeout(200);
    await page.keyboard.up("d");
    await page.waitForFunction(() => window.soundStarts.length > 0);
    await page.getByRole("button", { name: "Sound", exact: true }).click();
    const panel = await page.locator(".sound-panel").boundingBox();
    assert(panel.x >= 0 && panel.x + panel.width <= (mobile ? 390 : 1440));
    await page.getByLabel("Music volume").evaluate((e) => (e.value = "23"));
    await page.getByLabel("Music volume").dispatchEvent("input");
    await page.getByLabel("Effects volume").evaluate((e) => (e.value = "31"));
    await page.getByLabel("Effects volume").dispatchEvent("input");
    await page.getByRole("button", { name: "Mute all", exact: true }).click();
    assert.equal((await music()).paused, true);
    const pref = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("crumbs-audio-v1")),
    );
    assert.deepEqual(pref, { muted: true, music: 0.23, effects: 0.31 });
    await page.getByRole("button", { name: "Unmute", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("audio").paused);
    await page.locator("#pause").click();
    assert.equal((await music()).paused, true);
    await page.getByRole("button", { name: "Keep going", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("audio").paused);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal((await music()).paused, true);
    await page
      .getByRole("button", { name: "Keep going", exact: true })
      .waitFor();
    await page.screenshot({
      path: "deployments/sound-" + (mobile ? "mobile" : "desktop") + ".png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Start free run", exact: true })
      .waitFor();
    assert.equal(await page.locator("audio").count(), 0);
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("crumbs-audio-v1")).music,
      ),
      0.23,
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  write("deployments/audio-ui-proof.json", {
    passed: true,
    origin,
    checks: [
      "no autoplay before Start",
      "MP3 decoded and advanced",
      "Dash sound oscillator started",
      "separate music and effects levels persist",
      "mute pauses music",
      "game pause and window blur pause music",
      "desktop and mobile controls fit",
    ],
    checkedAt: new Date().toISOString(),
  });
  console.log(
    "Music, effects, pause, mute and persisted volume passed on desktop and mobile.",
  );
} finally {
  await browser.close();
}
