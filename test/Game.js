import {expect} from "chai";
import {network} from "hardhat";
const {ethers}=await network.create();
describe("CrumbsGame fixed distribution", function () {
  let owner, player, other, wrapper, game;
  const price = ethers.parseEther("0.0028"),
    id = ethers.id("play-one");
  const max = (price * 224877n) / 100000n,
    budget = price / 50n;
  const wordFor = (lo, hi) => {
    for (let n = 0n; n < 100000n; n++) {
      const tier = Number(
        BigInt(
          ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["uint256", "uint256"],
              [n, 0],
            ),
          ),
        ) % 10000n,
      );
      if (tier >= lo && tier < hi) return n;
    }
    throw Error("No test word");
  };
  beforeEach(async () => {
    [owner, player, other] = await ethers.getSigners();
    wrapper = await (await ethers.getContractFactory("MockNativeVRF")).deploy();
    game = await (
      await ethers.getContractFactory("CrumbsGame")
    ).deploy(await wrapper.getAddress(), price);
    await owner.sendTransaction({
      to: await game.getAddress(),
      value: price * 10n,
    });
  });
  async function draw(word) {
    await game.connect(player).enter(id, { value: price });
    await game.draw(id);
    await wrapper.fulfill(1, word);
    await game.settle(id);
    return (price * (await game.multiplierFor(word))) / 100000n;
  }
  it("reserves the full maximum return plus the oracle budget before accepting any entry", async () => {
    await game.withdrawBank(price * 10n);
    await expect(
      game.connect(player).enter(id, { value: price }),
    ).to.be.revertedWithCustomError(game, "InsufficientReserve");
    await owner.sendTransaction({
      to: await game.getAddress(),
      value: price * 2n,
    });
    await game.connect(player).enter(id, { value: price });
    expect(await game.locked()).to.equal(max + budget);
    await expect(game.withdrawBank(price)).to.be.revertedWithCustomError(
      game,
      "InsufficientReserve",
    );
  });
  it("maps randomness into every advertised payout range", async () => {
    for (const [lo, hi, a, b] of [
      [0, 6000, 80123n, 95877n],
      [6000, 9500, 103123n, 107877n],
      [9500, 9950, 110123n, 119877n],
      [9950, 10000, 175123n, 224877n],
    ]) {
      const value = await game.multiplierFor(wordFor(lo, hi));
      expect(value).to.be.at.least(a);
      expect(value).to.be.at.most(b);
    }
  });
  it("credits the exact high-band amount and pays only the original player", async () => {
    const amount = await draw(wordFor(9950, 10000));
    expect(await game.credit(player.address)).to.equal(amount);
    await expect(game.connect(other).claim(other.address)).to.revert(ethers);
    await expect(
      game.connect(player).claim(player.address),
    ).to.changeEtherBalance(ethers, player, amount);
    expect(await game.locked()).to.equal(0);
    await expect(game.connect(player).claim(player.address)).to.revert(ethers);
  });
  it("returns part of the entry in the lower band instead of forfeiting everything", async () => {
    const amount = await draw(wordFor(0, 6000));
    expect(amount).to.be.at.least((price * 80123n) / 100000n);
    expect(amount).to.be.below(price);
    expect(await game.credit(player.address)).to.equal(amount);
  });
  it("rejects changed stakes, reused IDs, forged callbacks, duplicate draws and duplicate settlement", async () => {
    await expect(game.connect(player).enter(id, { value: price - 1n })).to.revert(ethers);
    await game.connect(player).enter(id, { value: price });
    await expect(game.connect(other).enter(id, { value: price })).to.revert(ethers);
    await expect(
      game.rawFulfillRandomWords(1, [0]),
    ).to.be.revertedWithCustomError(game, "Unauthorized");
    await game.draw(id);
    await expect(game.draw(id)).to.revert(ethers);
    await wrapper.fulfill(1, 7);
    await wrapper.fulfill(1, 9);
    await game.settle(id);
    expect(await game.credit(player.address)).to.equal(
      (price * (await game.multiplierFor(7))) / 100000n,
    );
    await expect(game.settle(id)).to.revert(ethers);
  });
  it("caps oracle costs without consuming a failed request", async () => {
    await game.connect(player).enter(id, { value: price });
    await wrapper.setFee(price);
    await expect(game.draw(id)).to.be.revertedWithCustomError(
      game,
      "OracleTooExpensive",
    );
    expect((await game.plays(id)).state).to.equal(1);
    expect(await game.locked()).to.equal(max + budget);
  });
  it("refunds only entries never submitted to VRF after one day", async () => {
    await game.connect(player).enter(id, { value: price });
    await expect(game.connect(player).refundUnrequested(id)).to.revert(ethers);
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");
    await game.connect(player).refundUnrequested(id);
    expect(await game.credit(player.address)).to.equal(price);
    await expect(game.draw(id)).to.revert(ethers);
  });
  it("pauses new entries while preserving draws, settlement and claims", async () => {
    await game.connect(player).enter(id, { value: price });
    await game.setPaused(true);
    await expect(game.connect(other).setPaused(false)).to.revert(ethers);
    await expect(game.connect(other).enter(ethers.id("two"), { value: price }))
      .to.revert(ethers);
    await game.draw(id);
    await ethers.provider.send("evm_increaseTime", [86401]);
    await expect(game.connect(player).refundUnrequested(id)).to.revert(ethers);
    await wrapper.fulfill(1, 5);
    await game.settle(id);
    await game.connect(player).claim(player.address);
  });
  it("matches reordered callbacks and prevents the owner taking reserved credits", async () => {
    const second = ethers.id("second");
    await game.connect(player).enter(id, { value: price });
    await game.connect(other).enter(second, { value: price });
    await game.draw(id);
    await game.draw(second);
    await wrapper.fulfill(2, 0);
    await wrapper.fulfill(1, 1);
    await game.settle(second);
    await game.settle(id);
    expect(await game.credit(player.address)).to.equal(
      (price * (await game.multiplierFor(1))) / 100000n,
    );
    expect(await game.credit(other.address)).to.equal(
      (price * (await game.multiplierFor(0))) / 100000n,
    );
    await game.withdrawBank(await game.freeReserve());
    expect(await ethers.provider.getBalance(await game.getAddress())).to.equal(
      await game.locked(),
    );
    await game.connect(player).claim(player.address);
    await game.connect(other).claim(other.address);
  });
});


