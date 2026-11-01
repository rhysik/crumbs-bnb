import assert from "node:assert/strict";
import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  keccak256,
  formatEther,
} from "ethers";
import { read, write, fetchRead } from "../deploy/common.mjs";

const records = read("deployments/mainnet.json");
const game = read("deployments/game-mainnet.json");
const publication = read("deployments/publication.json");
assert.equal(publication.stage, "mainnet");
const provider = new JsonRpcProvider(records.rpcUrl);
assert.equal(Number(await provider.send("eth_chainId", [])), 56);
const contracts = [];
for (const [name, deployment, args] of [
  ["CrumbsRecords", records, [records.scoreSigner]],
  ["CrumbsGame", game, [game.wrapper, BigInt(game.entryPrice)]],
]) {
  const address = deployment.market || deployment.address;
  const artifact = read(`artifacts/contracts/${name}.sol/${name}.json`);
  const receipt = await provider.getTransactionReceipt(deployment.deploymentTransaction);
  const transaction = await provider.getTransaction(deployment.deploymentTransaction);
  assert.equal(receipt.status, 1);
  assert.equal(receipt.contractAddress.toLowerCase(), address.toLowerCase());
  assert.notEqual(await provider.getCode(address), "0x");
  const expected = await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(...args);
  assert.equal(keccak256(transaction.data), keccak256(expected.data));
  const contract = new Contract(address, artifact.abi, provider);
  assert.equal((await contract.owner()).toLowerCase(), deployment.owner.toLowerCase());
  contracts.push({ name, address, transaction: deployment.deploymentTransaction, sourceMatches: true });
}
const origin = publication.verifiedOrigin;
const config = await (await fetchRead(origin + "/contracts.json")).json();
const health = await (await fetchRead(origin + "/api/health")).json();
assert.equal(config.stage, "mainnet");
assert.equal(config.chainId, 56);
assert.equal(config.market.toLowerCase(), records.market.toLowerCase());
assert.equal(config.game.address.toLowerCase(), game.address.toLowerCase());
assert.equal(config.xUrl, "https://x.com/playcrumbs_bnb");
assert.equal(health.chainId, 56);
assert.equal(health.scoreService, true);
const bank = new Contract(game.address, read("artifacts/contracts/CrumbsGame.sol/CrumbsGame.json").abi, provider);
const [balance, locked, free, maximum, oracleBudget, paused] = await Promise.all([
  provider.getBalance(game.address), bank.locked(), bank.freeReserve(), bank.maximumPayout(), bank.oracleBudget(), bank.paused(),
]);
assert.equal(balance - locked, free);
const entry = BigInt(game.entryPrice);
assert.equal(await bank.entryPrice(), entry);
assert.equal((await bank.wrapper()).toLowerCase(), game.wrapper.toLowerCase());
assert.equal(maximum, entry * 224877n / 100000n);
const canAcceptEntry = !paused && free + entry >= maximum + oracleBudget;
write("deployments/mainnet-readiness.json", {
  passed: true,
  chainId: 56,
  contracts,
  origin,
  xUrl: config.xUrl,
  bankBalanceBNB: formatEther(balance),
  freeReserveBNB: formatEther(free),
  canAcceptEntry,
  mainnetPaymentLifecycleTested: false,
  transactionsSentByThisCheck: 0,
  checkedAt: new Date().toISOString(),
});
console.log("Mainnet contracts and live configuration verified.");
console.log("Prize reserve:", formatEther(balance), "BNB. Paid entry available:", canAcceptEntry);
