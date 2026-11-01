import fs from "node:fs";
import readline from "node:readline/promises";
import {
  Wallet,
  JsonRpcProvider,
  ContractFactory,
  Contract,
  keccak256,
  parseEther,
  formatEther,
} from "ethers";
import { root, read, write, protect, unprotect, run } from "./common.mjs";
let key = process.env.CRUMBS_DEPLOY_KEY;
delete process.env.CRUMBS_DEPLOY_KEY;
process.chdir(root);
if (!key) throw Error("Enter the private key in the local masked prompt");
const p = new JsonRpcProvider("https://bsc-dataseed.bnbchain.org");
if (Number(await p.send("eth_chainId", [])) !== 56)
  throw Error("Wrong mainnet chain");
key = key.trim();
if (!/^(0x)?[0-9a-fA-F]{64}$/.test(key)) {
  key = "";
  throw Error(
    "Invalid private key format. Enter 64 hexadecimal characters in the local masked prompt.",
  );
}
let wallet;
try {
  wallet = new Wallet(key.startsWith("0x") ? key : "0x" + key, p);
} catch {
  throw Error("Private key could not be opened. No transaction sent.");
} finally {
  key = "";
}
fs.mkdirSync(".secrets", { recursive: true });
const authorityFile = ".secrets/mainnet-authority.dpapi";
if (!fs.existsSync(authorityFile))
  fs.writeFileSync(authorityFile, protect(Wallet.createRandom().privateKey));
const authority = new Wallet(unprotect(fs.readFileSync(authorityFile, "utf8")));
const wrapper = "0x471506e6ADED0b9811D05B8cAc8Db25eE839Ac94",
  price = parseEther("0.0028");
const steps = [
  {
    name: "records",
    file: "mainnet.json",
    artifact: "CrumbsRecords",
    args: [authority.address],
  },
  {
    name: "game",
    file: "game-mainnet.json",
    artifact: "CrumbsGame",
    args: [wrapper, price],
  },
];
let budget = 0n;
const fee = await p.getFeeData();
for (const step of steps) {
  step.a = read(
    "artifacts/contracts/" + step.artifact + ".sol/" + step.artifact + ".json",
  );
  step.data = await new ContractFactory(
    step.a.abi,
    step.a.bytecode,
    wallet,
  ).getDeployTransaction(...step.args);
  if (!fs.existsSync("deployments/" + step.file))
    budget +=
      (((await p.estimateGas({ ...step.data, from: wallet.address })) * 150n) /
        100n) *
      fee.gasPrice;
}
console.log("Crumbs mainnet deployer:", wallet.address);
console.log(
  "Two contracts: verified records and the fixed-odds BNB game bank.",
);
console.log(
  "Conservative deployment budget:",
  formatEther(budget),
  "BNB. No prize-bank funding is included.",
);
if ((await p.getBalance(wallet.address)) < budget)
  throw Error("Insufficient deployer BNB. No transaction sent.");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const answer = await rl.question(
  "Type DEPLOY exactly to broadcast, or close this window: ",
);
rl.close();
if (answer !== "DEPLOY") throw Error("Deployment cancelled");
for (const step of steps) {
  if (fs.existsSync("deployments/" + step.file)) {
    const d = read("deployments/" + step.file),
      address = d.market || d.address,
      c = new Contract(address, step.a.abi, p);
    if ((await c.owner()).toLowerCase() !== wallet.address.toLowerCase())
      throw Error("Existing deployment owner mismatch");
    if ((await p.getCode(address)) === "0x")
      throw Error("Existing deployment has no bytecode");
    console.log("Existing contract verified:", address);
    continue;
  }
  const progressFile = "deployments/mainnet-" + step.name + "-progress.json",
    rawFile = ".secrets/mainnet-" + step.name + "-transaction.dpapi";
  let progress = fs.existsSync(progressFile) ? read(progressFile) : null,
    receipt;
  if (progress) {
    if (
      progress.deployer.toLowerCase() !== wallet.address.toLowerCase() ||
      progress.dataHash !== keccak256(step.data.data)
    )
      throw Error(
        "Recorded transaction belongs to different source or deployer. Preserve its records.",
      );
    receipt = await p.getTransactionReceipt(progress.hash);
    if (!receipt) {
      const pending = await p.getTransaction(progress.hash);
      if (pending) {
        console.log("Waiting for recorded deployment:", progress.hash);
        receipt = await pending.wait();
      } else {
        const nonce = await p.getTransactionCount(wallet.address, "latest");
        if (nonce !== progress.nonce)
          throw Error(
            "Recorded nonce was consumed by a different transaction. Manual review required.",
          );
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const v = await rl.question(
          "Recorded hash is absent. Type RESUME to rebroadcast the exact same signed transaction: ",
        );
        rl.close();
        if (v !== "RESUME") throw Error("Resume cancelled");
        const raw = unprotect(fs.readFileSync(rawFile, "utf8"));
        if (keccak256(raw) !== progress.hash)
          throw Error("Recorded transaction hash mismatch");
        receipt = await (await p.broadcastTransaction(raw)).wait();
      }
    }
  } else {
    const nonce = await p.getTransactionCount(wallet.address, "pending");
    if (nonce !== (await p.getTransactionCount(wallet.address, "latest")))
      throw Error("Wallet has pending transactions. No new deployment sent.");
    const gas = await p.estimateGas({ ...step.data, from: wallet.address });
    const raw = await wallet.signTransaction({
      ...step.data,
      chainId: 56,
      nonce,
      gasLimit: (gas * 150n) / 100n,
      gasPrice: fee.gasPrice,
      type: 0,
    });
    progress = {
      hash: keccak256(raw),
      nonce,
      deployer: wallet.address,
      dataHash: keccak256(step.data.data),
    };
    fs.writeFileSync(rawFile, protect(raw));
    write(progressFile, progress);
    console.log("Recorded deployment:", progress.hash);
    receipt = await (await p.broadcastTransaction(raw)).wait();
  }
  if (receipt.status !== 1 || !receipt.contractAddress)
    throw Error(
      "Recorded deployment reverted. Preserve its records for review.",
    );
  const base = {
    stage: "mainnet",
    chainId: 56,
    networkName: "BNB Chain mainnet",
    rpcUrl: "https://bsc-dataseed.bnbchain.org",
    explorerUrl: "https://bscscan.com",
    owner: wallet.address,
    block: receipt.blockNumber,
    deploymentTransaction: progress.hash,
  };
  const d =
    step.name === "records"
      ? {
          ...base,
          market: receipt.contractAddress,
          scoreSigner: authority.address,
        }
      : {
          ...base,
          address: receipt.contractAddress,
          wrapper,
          entryPrice: String(price),
        };
  write("deployments/" + step.file, d);
  console.log("CONFIRMED", step.name, receipt.contractAddress);
}
console.log("ONCHAIN DONE. Site publication is a separate retryable step.");
try {
  run(process.execPath, ["deploy/publish.mjs", "--mainnet"]);
} catch {
  console.log(
    "ONCHAIN DONE, PUBLICATION STOPPED. Use PUBLISH MAINNET.bat; do not redeploy.",
  );
  process.exitCode = 1;
}
console.log(
  "The prize bank is not automatically funded. Use /bank/ with the owner wallet when ready.",
);
