import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
export default defineConfig({
  plugins: [hardhatEthers, hardhatMocha, hardhatMatchers],
  solidity: {
    version: "0.8.26",
    path: "node_modules/solc/soljson.js",
    preferWasm: true,
    settings: { optimizer: { enabled: true, runs: 500 }, evmVersion: "paris" },
  },
  networks: {
    hardhatMainnet: { type: "edr-simulated", chainType: "l1", chainId: 31337 },
  },
  test: { mocha: { timeout: 20000 } },
});
