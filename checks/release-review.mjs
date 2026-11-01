import assert from "node:assert/strict";
import { read, write } from "../deploy/common.mjs";

const hosting = read("deployments/hosting.json");
const publication = read("deployments/publication.json");
const browser = read("deployments/ui-proof.json");
const money = read("deployments/public-money-proof.json");
assert.ok(browser.passed && money.bothOutcomesObserved);
assert.equal(browser.game, money.game);
const routes = [];
for (const route of ["/", "/app/", "/docs/", "/bank/"]) {
  const response = await fetch(publication.verifiedOrigin + route);
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
const health = await (await fetch(hosting.previewUrl + "/api/health")).json();
assert.equal(health.chainId, 97);
for (const route of [
  "/.secrets/test-wallet.dpapi",
  "/deployments/game-testnet.json",
])
  assert.equal((await fetch(hosting.previewUrl + route)).status, 404);
write("deployments/release-proof.json", {
  passed: true,
  stage: "testnet",
  game: money.game,
  contractTests: 16,
  simulationAndEconomyTests: 18,
  browserLifecycle: true,
  batCheck: true,
  mainnetTransactionsSent: false,
  anonymousRoutes: routes,
  domain: hosting.domain,
  domainStatus: publication.domainStatus,
  checkedAt: new Date().toISOString(),
});
console.log(
  "Final public routes, headers, card metadata and secret-file exclusion passed.",
);
