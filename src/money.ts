import type { NetworkConfig, PaidEntry } from "./types";
import type { Contract, JsonRpcSigner } from "ethers";
type WalletConnection = { signer: JsonRpcSigner; game: Contract };
import { audio, mountAudioControls } from "./audio";
import { getWallet } from "./api";
import { TIERS } from "../shared/economy.mjs";
import { prepareDraw } from "../shared/draw.mjs";
import { wheelSvg, wheelLegend } from "../shared/wheel.mjs";
const oddsTable = () =>
  '<div class="payout-bands">' +
  TIERS.map(
    (t) =>
      `<div><b>${t.chance / 100}%</b><span>${(t.low / 1000).toFixed(3)}–${(t.high / 1000).toFixed(3)}% returned</span></div>`,
  ).join("") +
  "</div>";
const ABI = [
  "function entryPrice() view returns(uint256)",
  "function freeReserve() view returns(uint256)",
  "function oracleBudget() view returns(uint256)",
  "function maximumPayout() view returns(uint256)",
  "function paused() view returns(bool)",
  "function enter(bytes32) payable",
  "function draw(bytes32)",
  "function settle(bytes32)",
  "function claim(address)",
  "function refundUnrequested(bytes32)",
  "function credit(address) view returns(uint256)",
  "function plays(bytes32) view returns(address player,uint64 enteredAt,uint32 seed,uint8 state,uint256 requestId,uint256 randomWord,uint256 oracleFee,uint256 payout)",
];
const safe = (text: any) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const key = (config: NetworkConfig) =>
  "crumbs-paid-" + config.chainId + "-" + config.game.address.toLowerCase();
const unit = (config: NetworkConfig) =>
  config.chainId === 97 ? "tBNB" : "BNB";
let stopped = () => {};
export function stopMoney() {
  stopped();
}
async function connection(config: NetworkConfig) {
  const signer = await getWallet(config),
    { Contract } = await import("ethers");
  return { signer, game: new Contract(config.game.address, ABI, signer) };
}
function error(e: any) {
  if (e.receipt?.status === 0)
    return "Transaction reverted. Your paid run is saved. Refresh its status before retrying.";
  return e.code === "ACTION_REJECTED"
    ? "Wallet request declined. No new action was confirmed."
    : e.shortMessage ||
        e.message ||
        "The wallet request could not be completed.";
}

export async function entryScreen(
  root: HTMLElement,
  config: NetworkConfig,
  practice: () => void,
  paid: (p: PaidEntry) => void,
) {
  stopMoney();
  root.innerHTML = `<div class="entry-page"><a class="wordmark" href="/">crumbs</a><section class="entry-body"><div><h1>A little run.<br/>One last twist.</h1><p>Take a trip through the whale vault. Finish with an independently drawn BNB return.</p><div class="practice-intro"><h2>Try the vault first.</h2><p>A full practice run with guards, crates and Dash. No wallet, entry fee or BNB prizes.</p><button class="yellow" id="practice">Try for free</button></div><img src="/mouse-v1.png" alt="Crumbs mouse"/></div><div class="entry-panel"><h2>Your entry</h2><p class="network-note">${safe(config.networkName)}${config.chainId === 97 ? " · Test funds only" : ""}</p><div class="entry-amount" id="entry-amount">Loading…</div><div class="odds"><div><strong>40%</strong><span>Higher gross return</span></div><div><strong>60%</strong><span>Partial return</span></div></div>${oddsTable()}<p>Returns include your original entry. Network gas is additional. Game score does not change these odds.</p><label class="entry-consent"><input type="checkbox" id="entry-consent"/> I am 18 or older and have read the <a href="/docs/">game and payment rules</a>.</label><button class="yellow" id="paid-enter" disabled>Enter with ${unit(config)}</button><button id="recover">Recover a paid run / claim balance</button><p class="small" id="money-status" role="status"></p></div></section></div>`;
  document.querySelector("#practice")!.addEventListener("click", practice);
  document
    .querySelector("#recover")!
    .addEventListener("click", () =>
      recover(root, config, () => entryScreen(root, config, practice, paid)),
    );
  const button = document.querySelector<HTMLButtonElement>("#paid-enter")!,
    consent = document.querySelector<HTMLInputElement>("#entry-consent")!,
    status = document.querySelector("#money-status")!;
  let ready = false;
  const { Contract, JsonRpcProvider, formatEther, hexlify, randomBytes } =
    await import("ethers");
  try {
    const provider = new JsonRpcProvider(config.rpcUrl),
      game = new Contract(config.game.address, ABI, provider);
    const [price, bank, budget, paused, maximum] = await Promise.all([
      game.entryPrice(),
      game.freeReserve(),
      game.oracleBudget(),
      game.paused(),
      game.maximumPayout(),
    ]);
    if (!button.isConnected) return;
    document.querySelector("#entry-amount")!.textContent =
      formatEther(price) + " " + unit(config);
    ready = !paused && bank >= maximum - price + budget;
    status.textContent = paused
      ? "Paid entries are paused. Existing returns remain claimable."
      : !ready
        ? "The prize reserve needs funding. Paid entries are unavailable."
        : "";
  } catch {
    if (!button.isConnected) return;
    status.textContent =
      "Paid entry is temporarily unavailable. You can still practice.";
  }
  consent.onchange = () => (button.disabled = !(ready && consent.checked));
  button.onclick = async () => {
    button.disabled = true;
    try {
      const { signer, game } = await connection(config),
        address = await signer.getAddress(),
        playId = hexlify(randomBytes(32));
      const price = await game.entryPrice();
      status.textContent =
        "Confirm the entry transaction in your wallet. " +
        (config.chainId === 97
          ? "This spends test tBNB only."
          : "This spends real BNB plus network gas.");
      const tx = await game.enter(playId, { value: price });
      const saved = { id: playId, address, entryTransaction: tx.hash };
      localStorage.setItem(key(config), JSON.stringify(saved));
      status.textContent = "Entry submitted. Waiting for confirmation…";
      await tx.wait();
      const play = await game.plays(playId);
      if (play.player.toLowerCase() !== address.toLowerCase())
        throw Error("Entry owner mismatch");
      paid({ ...saved, seed: Number(play.seed) });
    } catch (e) {
      status.textContent = error(e);
      button.disabled = !(ready && consent.checked);
    }
  };
}

async function recover(
  root: HTMLElement,
  config: NetworkConfig,
  back: () => void,
) {
  stopMoney();
  let saved: any = null;
  try {
    saved = JSON.parse(localStorage.getItem(key(config)) || "null");
  } catch {}
  root.innerHTML = `<div class="entry-page"><a class="wordmark" href="/">crumbs</a><section class="recovery entry-panel"><h1>Your returns.</h1><p>Reconnect the wallet used for your entry. Confirmed returns remain claimable even if you closed the game.</p><label>Play ID<input id="recover-id" value="${safe(saved?.id || "")}" placeholder="0x…"/></label><button class="yellow" id="recover-run">Open paid run</button><button id="claim-balance">Claim available wallet balance</button><button id="back-entry">Back</button><p class="small" id="recover-status" role="status"></p></section></div>`;
  document.querySelector("#back-entry")!.addEventListener("click", back);
  const status = document.querySelector("#recover-status")!;
  document.querySelector("#recover-run")!.addEventListener("click", () => {
    const id = document
      .querySelector<HTMLInputElement>("#recover-id")!
      .value.trim();
    if (!/^0x[\da-fA-F]{64}$/.test(id)) {
      status.textContent = "Enter the play ID saved with your entry.";
      return;
    }
    wheelScreen(root, config, id, back);
  });
  document
    .querySelector("#claim-balance")!
    .addEventListener("click", async () => {
      try {
        const { signer, game } = await connection(config),
          address = await signer.getAddress(),
          amount = await game.credit(address);
        const { formatEther } = await import("ethers");
        if (amount === 0n) {
          status.textContent =
            "No settled return is currently available for this wallet.";
          return;
        }
        status.textContent =
          "Confirm withdrawal of " +
          formatEther(amount) +
          " " +
          unit(config) +
          ". Gas is separate.";
        await (await game.claim(address)).wait();
        status.textContent = "Return confirmed in your wallet.";
      } catch (e) {
        status.textContent = error(e);
      }
    });
}

export async function wheelScreen(
  root: HTMLElement,
  config: NetworkConfig,
  playId: string,
  back: () => void,
) {
  stopMoney();
  let active = true;
  let clearAudioUI = () => {};
  stopped = () => {
    active = false;
    audio.stopRoll();
    clearAudioUI();
  };
  const entry = (Number(config.game.entryPrice) / 1e18).toFixed(4);
  root.innerHTML = `<div class="wheel-page"><a class="wordmark" href="/">crumbs</a><section class="wheel-panel"><div id="wheel-sound"></div><h1>One last twist.<img class="wheel-mouse" src="/mouse-v1.png" alt=""/></h1><p class="wheel-entry">Entry already paid: <strong>${entry} ${unit(config)}</strong></p><div class="wheel-body"><div class="wheel-wrap"><i class="wheel-pointer"></i><div class="return-wheel" id="return-wheel">${wheelSvg()}</div><div class="wheel-core"><strong>${unit(config)}</strong><span>return</span></div></div><div class="wheel-legend" aria-label="Payout colours and chances">${wheelLegend()}</div></div><div class="wheel-result"><div class="return-amount" id="return-amount">Your draw is waiting.</div><p class="small" id="wheel-status" role="status">One independent draw for this paid entry.</p></div><button class="yellow" id="wheel-action">Connect to draw</button><button id="wheel-back">Back to the crew</button><p class="wheel-odds">40% higher gross return · 60% partial return<br/>Returns include your entry. Gas is separate.</p><a class="play-id" href="${safe(config.explorerUrl)}/address/${config.game.address}">Play ID: ${safe(playId)}</a></section></div>`;
  clearAudioUI = mountAudioControls(document.querySelector("#wheel-sound")!);
  document.querySelector("#wheel-back")!.addEventListener("click", () => {
    stopMoney();
    back();
  });
  const action = document.querySelector<HTMLButtonElement>("#wheel-action")!,
    status = document.querySelector("#wheel-status")!,
    amount = document.querySelector("#return-amount")!;
  let conn: WalletConnection | undefined,
    shown = false;
  async function refresh() {
    if (!active) return;
    try {
      if (!conn) conn = await connection(config);
      const { game, signer } = conn,
        address = await signer.getAddress(),
        play = await game.plays(playId);
      if (play.player.toLowerCase() !== address.toLowerCase())
        throw Error("Connect the wallet that paid for this run.");
      if (play.state === 0n)
        throw Error("No confirmed paid entry exists for this play ID.");
      const expired =
        BigInt(Math.floor(Date.now() / 1000)) >= play.enteredAt + 86400n;
      action.disabled = false;
      if (play.state === 1n) {
        action.textContent = expired
          ? "Refund unrequested entry"
          : "Draw my return";
        status.textContent = expired
          ? "No random draw was requested within 24 hours. Your entry can be returned in full."
          : "Chainlink VRF determines the outcome. The project pays its oracle fee.";
        action.onclick = async () => {
          action.disabled = true;
          try {
            let drawOverrides;
            if (!expired) {
              status.textContent = "Checking the saved draw and network gas…";
              drawOverrides = await prepareDraw(
                game,
                signer.provider,
                address,
                playId,
              );
            }
            status.textContent =
              "Confirm " +
              (expired ? "the refund" : "the draw request") +
              " in your wallet.";
            await (
              await (expired
                ? game.refundUnrequested(playId)
                : game.draw(playId, drawOverrides))
            ).wait();
            await refresh();
          } catch (e) {
            status.textContent = error(e);
            action.disabled = false;
          }
        };
      } else if (play.state === 2n) {
        action.disabled = true;
        action.textContent = "Waiting for verified randomness";
        status.textContent =
          "The request is recorded onchain. No reroll or cancellation is available. You can return later with this play ID.";
        setTimeout(refresh, 7000);
      } else if (play.state === 3n) {
        action.textContent = "Confirm return";
        status.textContent =
          "Verified randomness received. Confirm settlement to credit your return.";
        action.onclick = async () => {
          action.disabled = true;
          try {
            await (await game.settle(playId)).wait();
            await refresh();
          } catch (e) {
            status.textContent = error(e);
            action.disabled = false;
          }
        };
      } else {
        const { formatEther } = await import("ethers");
        if (!shown) {
          shown = true;
          const bucket =
              play.state === 5n
                ? null
                : Number(
                    (play.payout * 100000n) / BigInt(config.game.entryPrice),
                  ),
            wheel = document.querySelector<HTMLElement>("#return-wheel")!;
          if (bucket !== null)
            wheel.style.setProperty(
              "--wheel-angle",
              String(
                1800 -
                  (bucket! < 100000
                    ? 108
                    : bucket! < 110123
                      ? 279
                      : bucket! < 175123
                        ? 350.1
                        : 359.1),
              ) + "deg",
            );
          const delay = matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 0
            : 3200;
          amount.textContent =
            play.state === 5n
              ? "Entry refunded."
              : "Revealing your confirmed return…";
          action.disabled = true;
          if (bucket !== null && delay) audio.roll(delay);
          await new Promise((r) => setTimeout(r, delay));
          audio.stopRoll();
          if (!active) return;
          audio.effect(bucket !== null && bucket > 100000 ? "plus" : "return");
        }
        amount.textContent = formatEther(play.payout) + " " + unit(config);
        status.textContent =
          (play.state === 5n
            ? "100%"
            : (
                Number(
                  (play.payout * 100000n) / BigInt(config.game.entryPrice),
                ) / 1000
              ).toFixed(3) + "%") + " of your entry. Network gas is separate.";
        const balance = await game.credit(address);
        action.disabled = balance === 0n;
        action.textContent =
          balance === 0n
            ? "Return already claimed"
            : "Claim " + formatEther(balance) + " " + unit(config);
        action.onclick = async () => {
          action.disabled = true;
          try {
            status.textContent =
              "Confirm the withdrawal transaction in your wallet.";
            await (await game.claim(address)).wait();
            status.textContent = "Return confirmed in your wallet.";
            action.textContent = "Return claimed";
            localStorage.removeItem(key(config));
          } catch (e) {
            status.textContent = error(e);
            action.disabled = false;
          }
        };
      }
    } catch (e) {
      status.textContent = error(e);
      action.disabled = false;
      action.textContent = "Reconnect / refresh";
      action.onclick = () => {
        conn = null;
        refresh();
      };
    }
  }
  action.onclick = () => {
    audio.unlock();
    void refresh();
  };
}

export async function bankScreen(root: HTMLElement, config: NetworkConfig) {
  stopMoney();
  root.innerHTML = `<div class="entry-page"><a class="wordmark" href="/">crumbs</a><section class="recovery entry-panel"><h1>The game bank.</h1><p>${safe(config.networkName)}${config.chainId === 97 ? " · Test funds only" : ""}</p><div id="bank-info">Loading bank…</div><label>Amount in ${unit(config)}<input type="number" min="0" step="0.001" id="bank-amount" value="0.01"/></label><button class="yellow" id="bank-fund">Fund prize reserve</button><button id="bank-withdraw">Withdraw unreserved bank funds</button><button id="bank-pause">Connect owner wallet / refresh</button><p class="small" id="bank-status" role="status"></p><p class="small">Player liabilities remain reserved. Only the owner can pause new entries or withdraw free bank funds.</p></section></div>`;
  const { Contract, JsonRpcProvider, formatEther, parseEther } = await import(
    "ethers"
  );
  const adminABI = [
    ...ABI,
    "function owner() view returns(address)",
    "function locked() view returns(uint256)",
    "function withdrawBank(uint256)",
    "function setPaused(bool)",
  ];
  const status = document.querySelector("#bank-status")!,
    pause = document.querySelector<HTMLButtonElement>("#bank-pause")!,
    withdraw = document.querySelector<HTMLButtonElement>("#bank-withdraw")!;
  let conn: any,
    isOwner = false,
    paused = false;
  withdraw.disabled = true;
  async function refresh() {
    try {
      const game = new Contract(
        config.game.address,
        adminABI,
        new JsonRpcProvider(config.rpcUrl),
      );
      const [owner, free, locked, p] = await Promise.all([
        game.owner(),
        game.freeReserve(),
        game.locked(),
        game.paused(),
      ]);
      paused = p;
      document.querySelector("#bank-info")!.innerHTML =
        `<p>Owner: ${safe(owner)}</p><p>Free reserve: <strong>${formatEther(free)} ${unit(config)}</strong></p><p>Reserved for players: <strong>${formatEther(locked)} ${unit(config)}</strong></p><p>New entries: ${p ? "paused" : "open, subject to sufficient reserve"}</p>`;
      if (conn) {
        isOwner =
          (await conn.signer.getAddress()).toLowerCase() ===
          owner.toLowerCase();
        withdraw.disabled = !isOwner;
        pause.textContent = isOwner
          ? paused
            ? "Resume new entries"
            : "Pause new entries"
          : "Connected wallet is not the owner";
        pause.disabled = !isOwner;
      }
    } catch (e) {
      status.textContent = error(e);
    }
  }
  async function connect() {
    const signer = await getWallet(config);
    conn = {
      signer,
      game: new Contract(config.game.address, adminABI, signer),
    };
    await refresh();
    return conn;
  }
  document.querySelector("#bank-fund")!.addEventListener("click", async () => {
    try {
      const { signer } = await connect(),
        value = parseEther(
          document.querySelector<HTMLInputElement>("#bank-amount")!.value,
        );
      if (value <= 0n) throw Error("Enter a positive funding amount.");
      status.textContent =
        "Confirm prize-bank funding in your wallet. This transfers " +
        formatEther(value) +
        " " +
        unit(config) +
        ".";
      await (
        await signer.sendTransaction({ to: config.game.address, value })
      ).wait();
      status.textContent = "Prize reserve funded.";
      await refresh();
    } catch (e) {
      status.textContent = error(e);
    }
  });
  withdraw.onclick = async () => {
    try {
      const { game } = await connect();
      if (!isOwner) throw Error("Connect the owner wallet.");
      const value = parseEther(
        document.querySelector<HTMLInputElement>("#bank-amount")!.value,
      );
      if (value <= 0n || value > (await game.freeReserve()))
        throw Error("Amount exceeds unreserved bank funds.");
      await (await game.withdrawBank(value)).wait();
      status.textContent = "Unreserved funds withdrawn.";
      await refresh();
    } catch (e) {
      status.textContent = error(e);
    }
  };
  pause.onclick = async () => {
    try {
      if (!conn) {
        await connect();
        return;
      }
      if (!isOwner) throw Error("Connect the owner wallet.");
      await (await conn.game.setPaused(!paused)).wait();
      await refresh();
    } catch (e) {
      status.textContent = error(e);
    }
  };
  await refresh();
}
