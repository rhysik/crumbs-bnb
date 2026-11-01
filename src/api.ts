import type { NetworkConfig } from "./types";
export async function api(route: string, body?: unknown) {
  const response = await fetch("/api/" + route, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("Game service is unavailable. Please try again shortly.");
  }
  if (!response.ok) throw Error(result.error || "Request failed");
  return result;
}
export const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
export async function getWallet(config: NetworkConfig) {
  const ethereum = (window as any).ethereum;
  if (!ethereum)
    throw Error(
      "Install an EVM wallet such as MetaMask to save an onchain record.",
    );
  const { BrowserProvider } = await import("ethers");
  await ethereum.request({ method: "eth_requestAccounts" });
  const chain = "0x" + Number(config.chainId).toString(16);
  if ((await ethereum.request({ method: "eth_chainId" })) !== chain) {
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chain }],
      });
    } catch (e: any) {
      if (e.code !== 4902) throw e;
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chain,
            chainName: config.networkName,
            rpcUrls: [config.rpcUrl],
            nativeCurrency: {
              name: config.chainId === 97 ? "Test BNB" : "BNB",
              symbol: config.chainId === 97 ? "tBNB" : "BNB",
              decimals: 18,
            },
            blockExplorerUrls: [config.explorerUrl],
          },
        ],
      });
    }
  }
  return await new BrowserProvider(ethereum).getSigner();
}
