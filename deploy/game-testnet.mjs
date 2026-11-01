import { testWallet } from "./test-wallet.mjs";
import fs from "node:fs";
import {
  Wallet,
  JsonRpcProvider,
  ContractFactory,
  Contract,
  keccak256,
  parseEther,
} from "ethers";
import { root, read, write } from "./common.mjs";
process.chdir(root);
const p = new JsonRpcProvider("https://bsc-testnet-dataseed.bnbchain.org");
if (Number(await p.send("eth_chainId", [])) !== 97)
  throw Error("Test network mismatch");
const wallet = testWallet(p);
const a = read("artifacts/contracts/CrumbsGame.sol/CrumbsGame.json");
const wrapper = "0x471506e6ADED0b9811D05B8cAc8Db25eE839Ac94",
  price = parseEther("0.0028");
let d;
if (fs.existsSync("deployments/game-testnet-v4.json"))
  d = read("deployments/game-testnet-v4.json");
else {
  let progress = fs.existsSync("deployments/game-testnet-v4-progress.json")
      ? read("deployments/game-testnet-v4-progress.json")
      : null,
    receipt;
  if (progress) {
    receipt = await p.getTransactionReceipt(progress.hash);
    if (!receipt)
      throw Error("Recorded game deployment pending. Do not redeploy.");
  } else {
    const factory = new ContractFactory(a.abi, a.bytecode, wallet),
      data = await factory.getDeployTransaction(wrapper, price);
    const nonce = await p.getTransactionCount(wallet.address, "pending");
    if (nonce !== (await p.getTransactionCount(wallet.address, "latest")))
      throw Error("Test wallet has pending transactions");
    const fee = await p.getFeeData(),
      gas = await p.estimateGas({ ...data, from: wallet.address });
    const raw = await wallet.signTransaction({
      ...data,
      nonce,
      chainId: 97,
      gasLimit: (gas * 125n) / 100n,
      gasPrice: fee.gasPrice,
      type: 0,
    });
    progress = { hash: keccak256(raw), nonce, owner: wallet.address };
    write("deployments/game-testnet-v4-progress.json", progress);
    receipt = await (await p.broadcastTransaction(raw)).wait();
  }
  if (!receipt.status || !receipt.contractAddress)
    throw Error("Game deployment failed");
  d = {
    address: receipt.contractAddress,
    chainId: 97,
    wrapper,
    entryPrice: String(price),
    owner: wallet.address,
    block: receipt.blockNumber,
    deploymentTransaction: progress.hash,
  };
  write("deployments/game-testnet-v4.json", d);
}
const game = new Contract(d.address, a.abi, wallet);
if (
  (await game.entryPrice()) !== price ||
  (await game.wrapper()).toLowerCase() !== wrapper.toLowerCase()
)
  throw Error("Game deployment verification failed");
if ((await game.freeReserve()) < parseEther("0.002")) {
  const tx = await wallet.sendTransaction({
    to: d.address,
    value: parseEther("0.004"),
  });
  console.log("Test bank funding:", tx.hash);
  await tx.wait();
}
write("deployments/game-testnet.json", d);
const config = read("public/contracts.json");
write("public/contracts.json", { ...config, game: d });
console.log(
  "Public test game:",
  d.address,
  "reserve tBNB",
  String(await game.freeReserve()),
);
