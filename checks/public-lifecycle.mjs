import { testWallet } from "../deploy/test-wallet.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
import { Wallet, JsonRpcProvider, Contract, verifyTypedData } from "ethers";
import { root, read, write, artifact } from "../deploy/common.mjs";
import { autopilot, VERSION } from "../shared/simulation.mjs";
import { domain, TYPES } from "../shared/claims.mjs";
process.chdir(root);
const d = read("deployments/testnet.json"),
  h = read("deployments/hosting.json"),
  origin = h.previewUrl;
const p = new JsonRpcProvider(d.rpcUrl);
assert.equal(Number(await p.send("eth_chainId", [])), 97);
const player = testWallet(p);
const contract = new Contract(d.market, artifact().abi, player);
async function call(name, payload, expected = 200) {
  const r = await fetch(origin + "/api/" + name, {
    method: payload ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await r.json();
  assert.equal(r.status, expected, JSON.stringify(data));
  return data;
}
const checks = [];
let session, run, created;
for (let i = 0; i < 12; i++) {
  created = Date.now();
  session = await call("session", { engine: VERSION });
  run = autopilot(session.seed);
  if (run.state.score > 0) break;
}
assert.ok(run.state.score > 0, "A bankable deterministic run is required");
console.log(
  "Public run:",
  session.id,
  "score",
  run.state.score,
  "duration",
  Math.ceil(run.state.tick / 60),
  "seconds",
);
await call("finish", { id: session.id, actions: [[32, 1]] }, 400);
checks.push("malformed replay rejected");
const fast = await fetch(origin + "/api/finish", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ id: session.id, actions: run.actions }),
});
assert.equal(fast.status, 400);
checks.push("unrealistically fast replay rejected");
const wait = Math.max(
  0,
  (run.state.tick * 1000) / 60 - (Date.now() - created) + 300,
);
await new Promise((r) => setTimeout(r, wait));
const result = await call("finish", { id: session.id, actions: run.actions });
assert.equal(result.score, run.state.score);
checks.push("server replay matches game score");
const challenge = await call("challenge", {
  id: session.id,
  address: player.address,
});
const attacker = Wallet.createRandom();
await call(
  "attestation",
  {
    id: session.id,
    address: player.address,
    expiry: challenge.expiry,
    signature: await attacker.signMessage(challenge.message),
  },
  403,
);
checks.push("wrong wallet signature rejected");
const claim = await call("attestation", {
  id: session.id,
  address: player.address,
  expiry: challenge.expiry,
  signature: await player.signMessage(challenge.message),
});
const signed = {
  player: player.address,
  score: claim.score,
  season: claim.season,
  runId: claim.runId,
  deadline: claim.deadline,
};
assert.equal(
  verifyTypedData(
    domain(97, d.market),
    TYPES,
    signed,
    claim.signature,
  ).toLowerCase(),
  d.scoreSigner.toLowerCase(),
);
checks.push("attestation bound to player, chain and contract");
const tx = await contract.record(
  claim.score,
  claim.season,
  claim.runId,
  claim.deadline,
  claim.signature,
);
write("deployments/public-test-pending.json", {
  hash: tx.hash,
  session: session.id,
  claim,
  player: player.address,
});
console.log("Test record submitted:", tx.hash);
const receipt = await tx.wait();
assert.equal(receipt.status, 1);
assert.ok(await contract.usedRuns(claim.runId));
assert.ok(Number(await contract.bestScore(1, player.address)) >= claim.score);
assert.ok(Number(await contract.badges(player.address, 1)) > 0);
checks.push("real testnet record, best score and badge confirmed");
await assert.rejects(
  contract.record.staticCall(
    claim.score,
    claim.season,
    claim.runId,
    claim.deadline,
    claim.signature,
  ),
);
checks.push("duplicate onchain run rejected");
await call("confirm", { id: session.id, transaction: tx.hash });
const board = await call("leaderboard");
assert.ok(
  board.records.some(
    (r) =>
      r.player.toLowerCase() === player.address.toLowerCase() &&
      r.score >= claim.score,
  ),
);
checks.push("confirmed record appears on hosted leaderboard");
const cross = await fetch(origin + "/api/session", {
  method: "POST",
  headers: { Origin: "https://example.invalid" },
});
assert.equal(cross.status, 403);
checks.push("cross-origin mutation rejected");
write("deployments/public-test-proof.json", {
  network: "BNB Testnet",
  chainId: 97,
  market: d.market,
  player: player.address,
  score: claim.score,
  badgeFlags: Number(await contract.badges(player.address, 1)),
  transaction: tx.hash,
  block: receipt.blockNumber,
  checks,
  checkedAt: new Date().toISOString(),
});
console.log("Public lifecycle passed:", checks.length, "checks.");
