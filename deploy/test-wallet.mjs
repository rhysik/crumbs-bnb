import fs from "node:fs";
import { Wallet } from "ethers";
import { root, unprotect } from "./common.mjs";
export function testWallet(provider) {
  const file = root + "/.secrets/test-wallet.dpapi";
  let key = process.env.CRUMBS_TEST_KEY;
  delete process.env.CRUMBS_TEST_KEY;
  if (key) {
    try {
      return new Wallet(key, provider);
    } catch {
      throw Error("Invalid test-only wallet key.");
    }
  }
  if (!fs.existsSync(file))
    throw Error(
      "Set CRUMBS_TEST_KEY locally for a test-only wallet before testing. Never use a mainnet wallet.",
    );
  try {
    return new Wallet(unprotect(fs.readFileSync(file, "utf8")), provider);
  } catch {
    throw Error("The protected test-only wallet cannot be opened.");
  }
}
