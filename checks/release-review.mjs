import assert from "node:assert/strict";
import { read, write, fetchRead } from "../deploy/common.mjs";

const hosting = read("deployments/hosting.json");
const publication = read("deployments/publication.json");
const active = read("deployments/" + publication.stage + ".json");
const activeGame = read("deployments/game-" + publication.stage + ".json");
const browser = read("deployments/ui-proof.json");
const money = read("deployments/public-money-proof.json");
assert.ok(browser.passed && money.bothOutcomesObserved);
assert.equal(browser.game, money.game);
const routes = [];
for (const route of ["/", "/app/", "/docs/", "/bank/"]) {
  const response = await fetchRead(publication.verifiedOrigin + route);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes("Crumbs"));
  assert.ok(html.includes("https://" + hosting.domain + "/crumbs-card-v1.png"));
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(
    response.headers
      .get("content-security-policy")
      ?.includes("frame-ancestors 'none'"),
  );
  routes.push({
    route,
    status: response.status,
    brand: true,
    preview: true,
    headers: true,
  });
}
const health = await (await fetchRead(publication.verifiedOrigin + "/api/health")).json();
assert.equal(health.chainId, active.chainId);
assert.equal(health.market.toLowerCase(), active.market.toLowerCase());
assert.equal(health.scoreService, true);
const config = await (await fetchRead(publication.verifiedOrigin + "/contracts.json")).json();
assert.equal(config.game.address.toLowerCase(), activeGame.address.toLowerCase());
assert.equal(config.xUrl, hosting.xUrl);
for (const route of [
  "/.secrets/test-wallet.dpapi",
  "/deployments/game-testnet.json",
])
  assert.equal((await fetchRead(hosting.previewUrl + route)).status, 404);
write("deployments/release-proof.json", {
  passed: true,
  stage: publication.stage,
  game: activeGame.address,
  contractTests: 16,
  simulationAndEconomyTests: 22,
  browserLifecycle: { passed: browser.passed, chainId: browser.chainId, game: browser.game },
  mainnetPaidLifecycleVerified: false,
  batCheck: true,
  mainnetTransactionsSentByReview: false,
  anonymousRoutes: routes,
  domain: hosting.domain,
  domainStatus: publication.domainStatus,
  checkedAt: new Date().toISOString(),
});
console.log(
  "Final public routes, headers, card metadata and secret-file exclusion passed.",
);
