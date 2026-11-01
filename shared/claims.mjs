export const TYPES = {
  Record: [
    { name: "player", type: "address" },
    { name: "score", type: "uint32" },
    { name: "season", type: "uint32" },
    { name: "runId", type: "bytes32" },
    { name: "deadline", type: "uint64" },
  ],
};
export const domain = (chainId, verifyingContract) => ({
  name: "CrumbsRecords",
  version: "1",
  chainId: Number(chainId),
  verifyingContract,
});
export function challengeMessage({
  origin,
  id,
  address,
  score,
  chainId,
  expiry,
}) {
  return `Crumbs: link a verified run\nSite: ${origin}\nRun: ${id}\nWallet: ${address.toLowerCase()}\nScore: ${score}\nChain ID: ${chainId}\nExpires: ${expiry}\nThis signature links a game result. It does not move funds.`;
}
