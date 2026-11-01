export async function prepareDraw(game, provider, player, playId) {
  const fee = await provider.getFeeData();
  const gasPrice = fee.gasPrice;
  if (!gasPrice || gasPrice <= 0n)
    throw Error(
      "Gas price is unavailable. Your paid entry is saved; refresh and retry this draw.",
    );
  const simulation = { from: player, gasPrice, gasLimit: 600000n };
  await game.draw.staticCall(playId, simulation);
  const estimated = await game.draw.estimateGas(playId, simulation);
  const padded = (estimated * 150n + 99n) / 100n;
  const gasLimit = padded > 350000n ? padded : 350000n;
  if ((await provider.getBalance(player)) < gasLimit * gasPrice)
    throw Error(
      "Not enough BNB for draw gas. Your paid entry is saved. Add BNB to this wallet, then retry the draw.",
    );
  return { gasLimit, gasPrice, type: 0 };
}
