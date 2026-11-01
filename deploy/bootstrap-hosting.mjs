import fs from "node:fs";
import { root, cf, write } from "./common.mjs";
process.chdir(root);
if (fs.existsSync("deployments/hosting.json")) {
  console.log("Hosting already configured.");
  process.exit(0);
}
const accounts = await cf("/accounts");
if (accounts.length !== 1)
  throw Error("Select the intended Cloudflare account before publishing");
const account = accounts[0].id;
const existing = await cf("/accounts/" + account + "/d1/database");
let db = existing.find((x) => x.name === "crumbs-bnb");
if (!db)
  db = await cf("/accounts/" + account + "/d1/database", "POST", {
    name: "crumbs-bnb",
  });
const sub = await cf("/accounts/" + account + "/workers/subdomain");
if (!sub.subdomain)
  throw Error("Cloudflare workers.dev subdomain is not configured");
write("deployments/hosting.json", {
  account,
  database: db.uuid,
  worker: "crumbs-bnb",
  previewUrl: "https://crumbs-bnb." + sub.subdomain + ".workers.dev",
  domain: null,
});
console.log(
  "Crumbs hosting configured:",
  db.uuid,
  "workers.dev preview available.",
);
