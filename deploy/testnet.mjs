import { testWallet } from "./test-wallet.mjs";
import fs from "node:fs";
import {
  Wallet,
  JsonRpcProvider,
  ContractFactory,
  Contract,
  keccak256,
} from "ethers";
import { root, write, read, artifact, protect, unprotect } from "./common.mjs";
process.chdir(root);
fs.mkdirSync(".secrets", { recursive: true });
const rpc = "https://bsc-testnet-dataseed.bnbchain.org",
  p = new JsonRpcProvider(rpc);
if (BigInt(await p.send("eth_chainId", [])) !== 97n)
  throw Error("Wrong test chain");
const deployer = testWallet(p);
const keyfile = ".secrets/testnet-authority.dpapi";
let authority;
if (fs.existsSync(keyfile))
  authority = new Wallet(unprotect(fs.readFileSync(keyfile, "utf8")));
else {
  authority = Wallet.createRandom();
  fs.writeFileSync(keyfile, protect(authority.privateKey));
}
if (fs.existsSync("deployments/testnet.json")) {
  const d = read("deployments/testnet.json"),
    c = new Contract(d.market, artifact().abi, p);
  if ((await c.scoreSigner()).toLowerCase() !== authority.address.toLowerCase())
    throw Error("Test authority mismatch");
  console.log("Existing test deployment verified:", d.market);
  process.exit(0);
}
if ((await p.getBalance(deployer.address)) < 1000000000000000n)
  throw Error("Public BNB test wallet needs tBNB");
const factory = new ContractFactory(
    artifact().abi,
    artifact().bytecode,
    deployer,
  ),
  data = await factory.getDeployTransaction(authority.address);
let progress = fs.existsSync("deployments/testnet-progress.json")
  ? read("deployments/testnet-progress.json")
  : null;
let receipt;
if (progress) {
  receipt = await p.getTransactionReceipt(progress.hash);
  if (!receipt)
    throw Error("Recorded test deployment is pending. Do not redeploy.");
} else {
  const nonce = await p.getTransactionCount(deployer.address, "pending");
  if (nonce !== (await p.getTransactionCount(deployer.address, "latest")))
    throw Error("Test wallet has pending transactions");
  const fee = await p.getFeeData(),
    gas = await p.estimateGas({ ...data, from: deployer.address });
  const raw = await deployer.signTransaction({
    ...data,
    chainId: 97,
    nonce,
    gasLimit: (gas * 125n) / 100n,
    gasPrice: fee.gasPrice,
    type: 0,
  });
  progress = {
    deployer: deployer.address,
    hash: keccak256(raw),
    nonce,
    signer: authority.address,
  };
  write("deployments/testnet-progress.json", progress);
  const tx = await p.broadcastTransaction(raw);
  receipt = await tx.wait();
}
if (receipt.status !== 1 || !receipt.contractAddress)
  throw Error("Test deployment failed");
const d = {
  stage: "testnet",
  chainId: 97,
  networkName: "BNB Testnet",
  rpcUrl: rpc,
  explorerUrl: "https://testnet.bscscan.com",
  market: receipt.contractAddress,
  scoreSigner: authority.address,
  owner: deployer.address,
  block: receipt.blockNumber,
  deploymentTransaction: progress.hash,
};
write("deployments/testnet.json", d);
write("public/contracts.json", d);
console.log("Crumbs public test contract:", d.market);
