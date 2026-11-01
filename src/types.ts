export interface GameConfig {
  address: string;
  chainId: 56 | 97;
  wrapper: string;
  entryPrice: string;
  owner: string;
  block: number;
  deploymentTransaction: string;
}
export interface NetworkConfig {
  stage: "mainnet" | "testnet";
  chainId: 56 | 97;
  networkName: string;
  rpcUrl: string;
  explorerUrl: string;
  market: string;
  scoreSigner: string;
  game?: GameConfig;
  xUrl?: string;
}
export interface PaidEntry {
  id: string;
  address: string;
  entryTransaction: string;
  seed: number;
}
