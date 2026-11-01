import fs from "node:fs";
import { Wallet, JsonRpcProvider, Contract } from "ethers";
import {
  root,
  read,
  write,
  workerConfig,
  wrangler,
  npm,
  unprotect,
  artifact,
  publicEndpoint,
  cf,
} from "./common.mjs";
process.chdir(root);
const stage = process.argv.includes("--mainnet") ? "mainnet" : "testnet";
const d = read("deployments/" + stage + ".json"),
  h = read("deployments/hosting.json");
if (fs.existsSync("deployments/game-" + stage + ".json"))
  d.game = read("deployments/game-" + stage + ".json");
const p = new JsonRpcProvider(d.rpcUrl);
if (Number(await p.send("eth_chainId", [])) !== d.chainId)
  throw Error("Publication network mismatch");
const c = new Contract(d.market, artifact().abi, p);
const authority = unprotect(
  fs.readFileSync(".secrets/" + stage + "-authority.dpapi", "utf8"),
);
if (
  (await c.scoreSigner()).toLowerCase() !==
  new Wallet(authority).address.toLowerCase()
)
  throw Error("Publication authority mismatch");
if (d.game) {
  const g = new Contract(
    d.game.address,
    [
      "function wrapper() view returns(address)",
      "function entryPrice() view returns(uint256)",
      "function maximumPayout() view returns(uint256)",
    ],
    p,
  );
  if (
    (await g.wrapper()).toLowerCase() !== d.game.wrapper.toLowerCase() ||
    (await g.entryPrice()) !== BigInt(d.game.entryPrice) ||
    (await g.maximumPayout()) !==
      (BigInt(d.game.entryPrice) * 224877n) / 100000n
  )
    throw Error("Published game economics mismatch");
}
const origin = h.domain ? "https://" + h.domain : h.previewUrl;
write("public/contracts.json", { ...d, ...(h.xUrl ? { xUrl: h.xUrl } : {}) });
for (const file of [
  "index.html",
  "app/index.html",
  "docs/index.html",
  "bank/index.html",
]) {
  let html = fs
    .readFileSync(file, "utf8")
    .replace(
      /content="(?:https?:\/\/[^" ]+)?\/crumbs-card-v\d+\.png"/g,
      'content="' + origin + '/crumbs-card-v1.png"',
    );
  fs.writeFileSync(file, html);
}
workerConfig(d, h);
const schema = await cf(
  `/accounts/${h.account}/d1/database/${h.database}/query`,
  "POST",
  { sql: "PRAGMA table_info(sessions)" },
);
if (
  schema[0]?.results?.length &&
  !schema[0].results.some((c) => c.name === "engine")
)
  await cf(`/accounts/${h.account}/d1/database/${h.database}/query`, "POST", {
    sql: "ALTER TABLE sessions ADD COLUMN engine INTEGER NOT NULL DEFAULT 2",
  });
wrangler([
  "d1",
  "execute",
  "crumbs-bnb",
  "--remote",
  "--file=worker/schema.sql",
]);
npm(["run", "build"]);
wrangler(["deploy"]);
wrangler(["secret", "put", "SCORE_KEY"], {
  input: authority,
  stdio: ["pipe", "inherit", "inherit"],
});
const saltfile = ".secrets/rate-salt";
if (!fs.existsSync(saltfile))
  fs.writeFileSync(saltfile, Wallet.createRandom().privateKey);
wrangler(["secret", "put", "RATE_SALT"], {
  input: fs.readFileSync(saltfile, "utf8"),
  stdio: ["pipe", "inherit", "inherit"],
});
const endpoint = await publicEndpoint(h);
const response = await fetch(endpoint.origin + "/api/health"),
  health = await response.json();
if (
  !response.ok ||
  health.chainId !== d.chainId ||
  health.market.toLowerCase() !== d.market.toLowerCase() ||
  !health.scoreService
)
  throw Error("Published configuration did not pass verification");
for (const route of ["/", "/app/", "/docs/", "/crumbs-card-v1.png"]) {
  const r = await fetch(endpoint.origin + route);
  if (!r.ok) throw Error("Publication page failed: " + route);
}
write("deployments/publication.json", {
  stage,
  origin,
  verifiedOrigin: endpoint.origin,
  domainStatus: endpoint.domainStatus,
  market: d.market,
  verifiedAt: new Date().toISOString(),
});
console.log(
  "Crumbs published and checked:",
  endpoint.origin,
  stage,
  "domain:",
  endpoint.domainStatus,
);
