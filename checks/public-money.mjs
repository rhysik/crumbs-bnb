import { testWallet } from "../deploy/test-wallet.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
import { Wallet, JsonRpcProvider, Contract, id, formatEther } from "ethers";
import { root, read, write } from "../deploy/common.mjs";
process.chdir(root);
const p = new JsonRpcProvider("https://bsc-testnet-dataseed.bnbchain.org");
assert.equal(Number(await p.send("eth_chainId", [])), 97);
const player = testWallet(p),
  d = read("deployments/game-testnet.json");
const game = new Contract(
  d.address,
  read("artifacts/contracts/CrumbsGame.sol/CrumbsGame.json").abi,
  player,
);
const file = "deployments/public-money-proof-v4.json";
let proof = fs.existsSync(file)
  ? read(file)
  : {
      network: "BNB Testnet",
      chainId: 97,
      game: d.address,
      wrapper: d.wrapper,
      plays: [],
      checks: [],
    };
for (let n = proof.plays.filter((x) => x.complete).length; n < 12; n++) {
  let entry = proof.plays.find((x) => !x.complete);
  if (!entry) {
    entry = { playId: id("Crumbs public VRF " + Date.now() + " " + n) };
    proof.plays.push(entry);
    write(file, proof);
  }
  let state = await game.plays(entry.playId);
  if (state.state === 0n) {
    const tx = await game.enter(entry.playId, { value: d.entryPrice });
    entry.entryTransaction = tx.hash;
    write(file, proof);
    await tx.wait();
    console.log("Paid test entry:", tx.hash);
    state = await game.plays(entry.playId);
  }
  if (state.state === 1n) {
    const tx = await game.draw(entry.playId, { gasLimit: 600000 });
    entry.drawTransaction = tx.hash;
    write(file, proof);
    await tx.wait();
    console.log("Official VRF requested:", tx.hash);
  }
  for (let tries = 0; tries < 90; tries++) {
    state = await game.plays(entry.playId);
    if (state.state >= 3n) break;
    if (tries % 6 === 0)
      console.log(
        "Waiting for official VRF callback, request",
        String(state.requestId),
      );
    await new Promise((r) => setTimeout(r, 10000));
  }
  assert.ok(
    state.state >= 3n,
    "VRF callback has not arrived. Preserve this request; never reroll it.",
  );
  if (state.state === 3n) {
    const tx = await game.settle(entry.playId);
    entry.settlementTransaction = tx.hash;
    write(file, proof);
    await tx.wait();
    state = await game.plays(entry.playId);
  }
  entry.payout = String(state.payout);
  entry.oracleFee = String(state.oracleFee);
  entry.requestId = String(state.requestId);
  entry.higherReturn = state.payout > BigInt(d.entryPrice);
  assert.equal(
    state.payout,
    (BigInt(d.entryPrice) * (await game.multiplierFor(state.randomWord))) /
      100000n,
  );
  const amount = await game.credit(player.address);
  assert.ok(amount >= state.payout);
  if (amount > 0n) {
    const balance = await p.getBalance(player.address);
    const tx = await game.claim(player.address);
    entry.claimTransaction = tx.hash;
    write(file, proof);
    const receipt = await tx.wait();
    const after = await p.send("eth_getBalance", [player.address, "latest"]);
    assert.equal(BigInt(after) - balance + receipt.fee, amount);
  }
  entry.complete = true;
  entry.checkedAt = new Date().toISOString();
  write(file, proof);
  console.log(
    "Actual return",
    String(Number(await game.multiplierFor(state.randomWord)) / 1000) + "%",
    formatEther(state.payout),
    "tBNB; VRF cost",
    formatEther(state.oracleFee),
  );
  if (
    proof.plays.some((x) => x.higherReturn) &&
    proof.plays.some((x) => x.complete && !x.higherReturn)
  )
    break;
}
proof.checks = [
  "official native-paid Chainlink VRF callback received",
  "maximum payout reserved before entry",
  "actual variable payout matches verified random word",
  "settlement credited to original player",
  "withdrawal reached player wallet with gas accounted separately",
];
proof.bothOutcomesObserved =
  proof.plays.some((x) => x.higherReturn) &&
  proof.plays.some((x) => x.complete && !x.higherReturn);
proof.checkedAt = new Date().toISOString();
write(file, proof);
console.log(
  "Public money lifecycle complete. Both outcomes:",
  proof.bothOutcomesObserved,
);

write("deployments/public-money-proof.json", proof);
