import {expect} from "chai";
import {network} from "hardhat";
const {ethers}=await network.create();
describe("Crumbs verified records", () => {
  let owner, player, other, authority, c, domain, run, deadline;
  const types = {
    Record: [
      { name: "player", type: "address" },
      { name: "score", type: "uint32" },
      { name: "season", type: "uint32" },
      { name: "runId", type: "bytes32" },
      { name: "deadline", type: "uint64" },
    ],
  };
  beforeEach(async () => {
    [owner, player, other, authority] = await ethers.getSigners();
    c = await (
      await ethers.getContractFactory("CrumbsRecords")
    ).deploy(authority.address);
    domain = {
      name: "CrumbsRecords",
      version: "1",
      chainId: 31337,
      verifyingContract: await c.getAddress(),
    };
    run = ethers.id("unique-run");
    deadline = (await ethers.provider.getBlock("latest")).timestamp + 300;
  });
  const sign = (
    score = 150,
    who = player.address,
    season = 1,
    id = run,
    end = deadline,
    signer = authority,
    dom = domain,
  ) =>
    signer.signTypedData(dom, types, {
      player: who,
      score,
      season,
      runId: id,
      deadline: end,
    });
  it("accepts a verified result and records badges", async () => {
    const sig = await sign();
    await expect(c.connect(player).record(150, 1, run, deadline, sig))
      .emit(c, "RecordSaved")
      .withArgs(player.address, 1, run, 150, 3);
    expect(await c.bestScore(1, player.address)).eq(150);
    expect(await c.badges(player.address, 1)).eq(3);
  });
  it("rejects duplicate runs and keeps the best score", async () => {
    await c.connect(player).record(150, 1, run, deadline, await sign());
    await expect(
      c.connect(player).record(150, 1, run, deadline, await sign()),
    ).revertedWithCustomError(c, "UsedRun");
    const second = ethers.id("second");
    await c
      .connect(player)
      .record(
        100,
        1,
        second,
        deadline,
        await sign(100, player.address, 1, second),
      );
    expect(await c.bestScore(1, player.address)).eq(150);
  });
  it("binds the signature to player, chain and contract", async () => {
    const sig = await sign();
    await expect(
      c.connect(other).record(150, 1, run, deadline, sig),
    ).revertedWithCustomError(c, "Unauthorized");
    await expect(
      c.connect(player).record(
        150,
        1,
        run,
        deadline,
        await sign(150, player.address, 1, run, deadline, authority, {
          ...domain,
          chainId: 56,
        }),
      ),
    ).revertedWithCustomError(c, "Unauthorized");
    await expect(
      c.connect(player).record(
        150,
        1,
        run,
        deadline,
        await sign(150, player.address, 1, run, deadline, authority, {
          ...domain,
          verifyingContract: other.address,
        }),
      ),
    ).revertedWithCustomError(c, "Unauthorized");
  });
  it("rejects altered score, expired result and malformed signature", async () => {
    await expect(
      c.connect(player).record(151, 1, run, deadline, await sign()),
    ).revertedWithCustomError(c, "Unauthorized");
    await expect(
      c
        .connect(player)
        .record(150, 1, run, 1, await sign(150, player.address, 1, run, 1)),
    ).revertedWithCustomError(c, "Expired");
    await expect(
      c.connect(player).record(150, 1, run, deadline, "0x00"),
    ).revertedWithCustomError(c, "Invalid");
  });
  it("rejects impossible scores and unsigned authorities", async () => {
    await expect(
      c.connect(player).record(405, 1, run, deadline, await sign(405)),
    ).revertedWithCustomError(c, "Invalid");
    await expect(
      c
        .connect(player)
        .record(
          150,
          1,
          run,
          deadline,
          await sign(150, player.address, 1, run, deadline, other),
        ),
    ).revertedWithCustomError(c, "Unauthorized");
  });
  it("restricts administration and preserves historical seasons", async () => {
    await c.connect(player).record(150, 1, run, deadline, await sign());
    await expect(c.connect(player).nextSeason()).revertedWithCustomError(
      c,
      "Unauthorized",
    );
    await expect(
      c.connect(player).setSigner(other.address),
    ).revertedWithCustomError(c, "Unauthorized");
    await expect(c.connect(player).setPaused(true)).revertedWithCustomError(
      c,
      "Unauthorized",
    );
    await c.nextSeason();
    expect(await c.bestScore(1, player.address)).eq(150);
    await expect(
      c
        .connect(player)
        .record(150, 1, ethers.id("old"), deadline, await sign()),
    ).revertedWithCustomError(c, "WrongSeason");
  });
  it("supports pause and signer rotation without accepting old authority", async () => {
    await c.setPaused(true);
    await expect(
      c.connect(player).record(150, 1, run, deadline, await sign()),
    ).revertedWithCustomError(c, "Paused");
    await c.setPaused(false);
    const old = await sign();
    await c.setSigner(other.address);
    await expect(
      c.connect(player).record(150, 1, run, deadline, old),
    ).revertedWithCustomError(c, "Unauthorized");
    await c
      .connect(player)
      .record(
        150,
        1,
        run,
        deadline,
        await sign(150, player.address, 1, run, deadline, other),
      );
  });
});
