import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
export const root = path.resolve(import.meta.dirname, "..");
export const read = (f) =>
  JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
export function write(f, x) {
  const p = path.join(root, f);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(x, null, 2) + "\n");
}
export const artifact = () =>
  read("artifacts/contracts/CrumbsRecords.sol/CrumbsRecords.json");
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    ...opts,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error("Command failed: " + cmd);
  return r;
}
export const wrangler = (args, opts = {}) =>
  run(
    process.execPath,
    [path.join(root, "node_modules/wrangler/bin/wrangler.js"), ...args],
    opts,
  );
export function npm(args) {
  run("cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...args]);
}
export function protect(value) {
  const r = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))",
    ],
    { input: value, encoding: "utf8", windowsHide: true },
  );
  if (r.status !== 0 || !r.stdout.trim())
    throw Error("Windows key protection failed");
  return r.stdout.trim();
}
export function unprotect(value) {
  const r = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Add-Type -AssemblyName System.Security; [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))",
    ],
    { input: value, encoding: "utf8", windowsHide: true },
  );
  if (r.status !== 0)
    throw Error("Windows key protection cannot be opened for this user");
  return r.stdout.trim();
}
export async function fetchRead(url, options = {}) {
  if (options.method && options.method.toUpperCase() !== "GET")
    throw Error("Read retries only support GET requests");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        method: "GET",
        signal: options.signal || AbortSignal.timeout(12000),
      });
      if (
        (response.status !== 429 && response.status < 500) ||
        attempt === 2
      )
        return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt === 2 || options.signal?.aborted) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
}
export async function cf(route, method = "GET", body, refreshed = false) {
  const file = path.join(
    process.env.APPDATA,
    "xdg.config/.wrangler/config/default.toml",
  );
  const match = fs
    .readFileSync(file, "utf8")
    .match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!match) throw Error("Cloudflare login is unavailable");
  const request = method === "GET" ? fetchRead : fetch;
  const r = await request("https://api.cloudflare.com/client/v4" + route, {
    method,
    headers: {
      Authorization: "Bearer " + match[1],
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (
    !data.success &&
    !refreshed &&
    data.errors?.some((e) => e.code === 9109 || e.code === 10000)
  ) {
    wrangler(["whoami"], { stdio: "pipe" });
    return cf(route, method, body, true);
  }
  if (!data.success) throw Error("Cloudflare: " + JSON.stringify(data.errors));
  return data.result;
}
export function workerConfig(d, hosting) {
  const domain = hosting.domain;
  const config = {
    name: "crumbs-bnb",
    main: "worker/index.mjs",
    compatibility_date: "2026-11-01",
    compatibility_flags: ["nodejs_compat"],
    account_id: hosting.account,
    workers_dev: true,
    assets: {
      directory: "./dist",
      binding: "ASSETS",
      html_handling: "auto-trailing-slash",
      not_found_handling: "404-page",
      run_worker_first: ["/api/*", "/run/*"],
    },
    triggers: { crons: ["* * * * *"] },
    d1_databases: [
      {
        binding: "DB",
        database_name: "crumbs-bnb",
        database_id: hosting.database,
      },
    ],
    vars: {
      CHAIN_ID: String(d.chainId),
      RPC_URL: d.rpcUrl,
      RECORD_ADDRESS: d.market,
      SEASON: "1",
      DEPLOYMENT_BLOCK: String(d.block),
      GAME_ADDRESS: d.game?.address || "",
    },
  };
  if (domain) config.routes = [{ pattern: domain, custom_domain: true }];
  write("wrangler.jsonc", config);
}

export async function publicEndpoint(hosting) {
  if (!hosting.domain)
    return { origin: hosting.previewUrl, domainStatus: "not-configured" };
  const zones = await cf("/zones?name=" + encodeURIComponent(hosting.domain));
  const zone = zones.find((z) => z.name === hosting.domain);
  if (!zone || zone.account.id !== hosting.account)
    throw Error("Custom domain is not in the configured Cloudflare account");
  if (zone.status === "pending") {
    console.log(
      "Custom domain DNS is pending. Checking the published Worker address:",
      hosting.previewUrl,
    );
    return { origin: hosting.previewUrl, domainStatus: "pending" };
  }
  if (zone.status !== "active")
    throw Error("Custom domain zone is unavailable: " + zone.status);
  return { origin: "https://" + hosting.domain, domainStatus: "active" };
}
