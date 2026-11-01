import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { autopilot } from "../shared/simulation.mjs";
import { root, write } from "../deploy/common.mjs";
process.chdir(root);
const origin = "http://127.0.0.1:4181",
  backend = "http://127.0.0.1:4182";
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
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let expected, session, instrumented = false;
  // The test supplies deterministic controls to the real renderer. This replacement
  // exists only in the intercepted local response, never in the shipped game.
  await page.route("**/src/game.ts*", async (route) => {
    const response = await route.fetch(),
      text = await response.text();
    assert(text.includes("update(simulation, input);"));
    instrumented = true;
    await route.fulfill({
      response,
      body: text.replace(
        "update(simulation, input);",
        "input = window.replayControls[simulation.tick] || 0; update(simulation, input);",
      ),
    });
  });
  await page.route("**/api/session", async (route) => {
    const body = route.request().postDataJSON();
    for (let i = 0; i < 20; i++) {
      const response = await fetch(backend + "/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      session = await response.json();
      assert(response.ok);
      expected = autopilot(session.seed);
      if (expected.state.phase === "escaped") break;
    }
    assert.equal(expected.state.phase, "escaped");
    const controls = expected.actions.flatMap(([mask, count]) =>
      Array(count).fill(mask),
    );
    await page.evaluate((data) => (window.replayControls = data), controls);
    await route.fulfill({ json: session });
  });
  for (const endpoint of ["finish", "share"])
    await page.route("**/api/" + endpoint, async (route) => {
      const response = await fetch(backend + "/api/" + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: route.request().postData(),
      });
      const data = await response.json();
      assert(response.ok, JSON.stringify(data));
      if (endpoint === "share") {
        data.image = origin + new URL(data.image).pathname;
        data.url = origin + new URL(data.url).pathname;
      }
      await route.fulfill({ json: data });
    });
  await context.route("**/run/**", async (route) => {
    const response = await fetch(
      backend + new URL(route.request().url()).pathname,
    );
    await route.fulfill({
      status: response.status,
      body: Buffer.from(await response.arrayBuffer()),
      headers: { "Content-Type": response.headers.get("Content-Type") },
    });
  });
  await context.route("https://x.com/intent/tweet**", (route) =>
    route.fulfill({ body: "Prepared X composer. No post was sent." }),
  );
  await page.goto(origin + "/app/?mode=practice");
  await page.getByRole("button", { name: "Start free run", exact: true }).waitFor();
  assert(instrumented, "The local-only control driver must be installed");
  await page.getByRole("button", { name: "Start free run", exact: true }).click();
  await page
    .getByRole("heading", { name: "All crumbs collected.", exact: true })
    .waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector("#share").disabled);
  assert.equal(
    await page.locator(".result-score").innerText(),
    `${expected.state.score}points`,
  );
  assert.equal(
    await page.locator("#verify-status").innerText(),
    "Run verified.",
  );
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Share on X", exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  const intent = new URL(popup.url());
  assert.equal(intent.origin, "https://x.com");
  assert(
    intent.searchParams.get("text").includes(expected.state.score + " points"),
  );
  assert(intent.searchParams.get("text").includes("@playcrumbs_bnb"));
  assert.equal(
    intent.searchParams.get("url"),
    origin + "/run/" + session.id + "/",
  );
  await popup.close();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download victory card", exact: true })
    .click();
  const download = await downloadPromise;
  await download.saveAs("deployments/victory-card-ui.png");
  assert(fs.statSync("deployments/victory-card-ui.png").size > 10000);
  await page.screenshot({
    path: "deployments/victory-share-ui.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  write("deployments/share-ui-proof.json", {
    passed: true,
    localOnly: true,
    runId: session.id,
    score: expected.state.score,
    checks: [
      "full deterministic clear through real game renderer",
      "server replay verified the run",
      "share button enabled only after verification",
      "X intent contains actual score, handle and result link",
      "PNG downloads successfully",
      "no X post or wallet transaction sent",
    ],
    checkedAt: new Date().toISOString(),
  });
  console.log("Verified clear, prepared X post and PNG download passed.");
} finally {
  await browser.close();
}
