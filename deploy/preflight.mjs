import fs from "node:fs";
import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  parseEther,
  formatEther,
  keccak256,
} from "ethers";
import { root, read, npm, wrangler, cf, publicEndpoint } from "./common.mjs";
process.chdir(root);
const proof = read("deployments/public-money-proof.json"),
  ui = read("deployments/ui-proof.json");
if (proof.chainId !== 97 || !proof.plays.some((x) => x.complete) || !ui.passed)
  throw Error("Completed public money and browser tests are required");
if (
  proof.game.toLowerCase() !==
    read("deployments/game-testnet.json").address.toLowerCase() ||
  ui.game.toLowerCase() !== proof.game.toLowerCase()
)
  throw Error("Test proof does not match this game");
const td = read("deployments/game-testnet.json"),
  tp = new JsonRpcProvider("https://bsc-testnet-dataseed.bnbchain.org");
const a = read("artifacts/contracts/CrumbsGame.sol/CrumbsGame.json");
const expected = await new ContractFactory(
  a.abi,
  a.bytecode,
).getDeployTransaction(td.wrapper, BigInt(td.entryPrice));
const actual = await tp.getTransaction(td.deploymentTransaction);
if (!actual || keccak256(actual.data) !== keccak256(expected.data))
  throw Error("Compiled game differs from the public-tested deployment");
npm(["test"]);
npm(["run", "test:game"]);
npm(["run", "build"]);
wrangler(["whoami"], { stdio: "pipe" });
await cf("/accounts");
const p = new JsonRpcProvider("https://bsc-dataseed.bnbchain.org");
if (Number(await p.send("eth_chainId", [])) !== 56)
  throw Error("Wrong mainnet chain");
const wrapper = "0x471506e6ADED0b9811D05B8cAc8Db25eE839Ac94";
if ((await p.getCode(wrapper)) === "0x")
  throw Error("Official mainnet VRF wrapper is unavailable");
const fee = await p.getFeeData();
const w = new Contract(
  wrapper,
  [
    "function estimateRequestPriceNative(uint32,uint32,uint256) view returns(uint256)",
  ],
  p,
);
const oracle = await w.estimateRequestPriceNative(100000, 1, fee.gasPrice);
if (oracle > (parseEther("0.0028") * 2n) / 100n)
  throw Error(
    "Current mainnet oracle fee exceeds the configured budget. No transaction sent.",
  );
const h = read("deployments/hosting.json"),
  { origin } = await publicEndpoint(h);
for (const route of ["/", "/app/", "/docs/", "/bank/", "/api/health"])
  if (!(await fetch(origin + route)).ok)
    throw Error("Public page unavailable: " + route);
console.log(
  "PREFLIGHT OK: BNB mainnet, official native-paid VRF, public pages, tests and Cloudflare login.",
);
console.log(
  "Entry: 0.0028 BNB. Fixed payout bands: 40% higher gross returns, 60% partial returns. Theoretical RTP 95.9%.",
);
console.log(
  "Current estimated oracle cost per draw:",
  formatEther(oracle),
  "BNB, paid by the project bank.",
);
console.log(
  "No mainnet transaction sent. Deployment does not fund the prize bank.",
);
