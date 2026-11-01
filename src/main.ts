import "./style.css";
import "./money.css";
import { mountAudioControls } from "./audio";
import { entryScreen, wheelScreen, stopMoney, bankScreen } from "./money";
import { api, getWallet, short } from "./api";
import type { NetworkConfig, PaidEntry } from "./types";
import type { mountGame, GameState, RunResult } from "./game";
import { shareIntent } from "../shared/share.mjs";
import { VERSION, MAPS, createState } from "../shared/simulation.mjs";
const root = document.querySelector<HTMLDivElement>("#root")!;
let clearAudioUI = () => {};
let currentPaid: PaidEntry | null = null;
let config: NetworkConfig | null = null;
let runtime: ReturnType<typeof mountGame> | null = null;
let session: { id: string; seed: number; engine: number } | null = null;
let lastScore = Number(localStorage.getItem("crumbs-best") || 0),
  skin = localStorage.getItem("crumbs-skin") || "original";
let bestCollected = Number(localStorage.getItem("crumbs-collected") || 0),
  clears = Number(localStorage.getItem("crumbs-clears") || 0);
function practiceMapQueue() {
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem("crumbs-map-queue") || "[]");
  } catch {}
  if (
    !Array.isArray(queue) ||
    !queue.length ||
    queue.some((n) => !Number.isInteger(n) || n < 0 || n >= MAPS.length)
  ) {
    queue = MAPS.map((_, i) => i);
    for (let i = queue.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    const previousValue = localStorage.getItem("crumbs-last-map");
    const previous = previousValue === null ? -1 : Number(previousValue);
    if (queue[0] === previous) [queue[0], queue[1]] = [queue[1], queue[0]];
  }
  return queue;
}
const title = (text: string) => {
  document.title = text + " | Crumbs";
};
const brand = '<a class="wordmark" href="/">crumbs</a>';
function header() {
  return `<header>${brand}<nav><a href="/#crew">The crew</a><a href="/#leaderboard">Leaderboard</a><a href="/docs/">How to play</a></nav></header>`;
}
function footer() {
  return `<footer>${brand}<div><a href="/docs/">Game rules</a><span>Built for BNB Chain</span><a id="social-link" hidden target="_blank" rel="noopener noreferrer"></a><a href="https://github.com/rhysik/crumbs-bnb" target="_blank" rel="noopener noreferrer">Open source on GitHub</a></div></footer>`;
}
function refreshNetwork() {
  document
    .querySelectorAll("[data-network]")
    .forEach(
      (e) =>
        (e.textContent =
          config?.stage === "mainnet"
            ? "BNB Chain mainnet"
            : config?.stage === "testnet"
              ? "BNB Testnet"
              : "Network setup in progress"),
    );
  if (config?.xUrl) {
    const a = document.querySelector<HTMLAnchorElement>("#social-link");
    if (a) {
      a.hidden = false;
      a.href = config.xUrl;
      a.textContent = "@playcrumbs_bnb";
    }
  }
}
function escape(text: unknown) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}
function chooseMode() {
  clearAudioUI();
  runtime?.destroy();
  runtime = null;
  stopMoney();
  if (location.pathname !== "/app/" || location.search)
    history.pushState({}, "", "/app/");
  title("Enter the vault");
  if (config?.game)
    entryScreen(
      root,
      config,
      () => start(),
      (p) => start(p),
    );
  else start();
}
function lobby() {
  title("Whales have bags. We take crumbs.");
  root.innerHTML = `${header()}<main><section class="lobby"><div class="lobby-art"></div><h1>Whales have bags.<br/>We take crumbs.</h1><div class="start"><div class="lobby-actions"><a class="yellow play" href="/app/?mode=practice">Try for free</a><button class="play" id="play">Play for BNB</button></div><p>No wallet. No entry fee.</p></div><img class="lobby-mouse" src="/mouse-v1.png" width="472" height="640" alt="The cheeky Crumbs mouse in a yellow jacket"/></section><section class="crew" id="crew"><h2>Meet the crew</h2><img src="/crew-v1.png" width="1440" height="576" alt="Scout, Crumbs and Veteran mice"/><div class="crew-labels"><div><h3>Scout</h3><p>Collect 12 crumbs in one run</p><button data-skin="scout" ${bestCollected < 12 && lastScore < 120 ? "disabled" : ""}>${bestCollected < 12 && lastScore < 120 ? "Locked" : "Choose Scout"}</button></div><div><h3>Crumbs</h3><p>A tiny bag. A big appetite.</p><button data-skin="original">${skin === "original" ? "Selected" : "Choose Crumbs"}</button></div><div><h3>Veteran</h3><p>Clear a whole map</p><button data-skin="veteran" ${clears < 1 && lastScore < 200 ? "disabled" : ""}>${clears < 1 && lastScore < 200 ? "Locked" : "Choose Veteran"}</button></div></div></section><section class="rankings" id="leaderboard"><div class="rankings-top"><h2>The smallest<br/>big shots.</h2><div><span data-network>Loading network…</span><p>Verified onchain records. Season 1.</p></div></div><div id="rank-table" role="status">Loading records…</div></section><section class="rules-strip"><div><h2>Greed is optional.<br/>Getting home isn't.</h2><p>Collect every crumb before the 45-second clock runs out. Guards chase you around the crates. Each catch costs half your bag; three catches end the run.</p><a href="/docs/">Learn the tricks</a></div><img src="/game/guard.png" alt="A vault guard chasing the mouse"/></section></main>${footer()}`;
  document.querySelector("#play")!.addEventListener("click", chooseMode);
  document.querySelectorAll<HTMLButtonElement>("[data-skin]").forEach(
    (b) =>
      (b.onclick = () => {
        skin = b.dataset.skin!;
        localStorage.setItem("crumbs-skin", skin);
        lobby();
      }),
  );
  refreshNetwork();
  loadRanks();
}
async function loadRanks() {
  const target = document.querySelector("#rank-table");
  if (!target) return;
  try {
    const result = await api("leaderboard");
    if (!result.records.length) {
      target.innerHTML =
        '<div class="empty-rank">The vault is open. The board is waiting.<br/><span>Escape a run and save your record to take a spot.</span></div>';
      return;
    }
    target.innerHTML =
      "<table><thead><tr><th>Rank</th><th>Mouse</th><th>Crumbs score</th></tr></thead><tbody>" +
      result.records
        .map(
          (r: { player: string; score: number }, i: number) =>
            `<tr><td>${i + 1}</td><td><a href="${escape(config.explorerUrl)}/address/${escape(r.player)}">${escape(short(r.player))}</a></td><td>${Number(r.score)}</td></tr>`,
        )
        .join("") +
      "</tbody></table>";
  } catch {
    target.innerHTML =
      '<div class="empty-rank">Records are temporarily unavailable.<br/><button id="retry-ranks">Try again</button></div>';
    document
      .querySelector("#retry-ranks")
      ?.addEventListener("click", loadRanks);
  }
}
function shell() {
  clearAudioUI();
  root.innerHTML = `<div class="game-page"><div class="game-top">${brand}<div class="hud"><span><img src="/game/crumb.png" alt=""/><b id="carry">00</b></span><strong id="clock">00:45</strong><span id="lives" class="lives" aria-label="3 catches remaining">♥♥♥</span></div><button class="yellow pause" id="pause" aria-label="Pause game">Ⅱ</button></div><main class="game-shell"><div id="playfield"></div><div class="game-bottom"><span class="keyboard-hint">WASD / arrows to move · Space to dash</span><div class="touch-pad" aria-label="Movement controls"><button data-bit="1" aria-label="Move up">↑</button><button data-bit="4" aria-label="Move left">←</button><button data-bit="2" aria-label="Move down">↓</button><button data-bit="8" aria-label="Move right">→</button></div><div id="sound-host"></div><div class="abilities"><span id="ability-state"></span><button class="yellow" data-bit="16" id="dash">Dash</button></div></div><div id="overlay" hidden></div></main></div>`;
  clearAudioUI = mountAudioControls(document.querySelector("#sound-host")!);
  document
    .querySelector("#pause")!
    .addEventListener("click", () => runtime?.pause());
  document.querySelectorAll<HTMLButtonElement>("[data-bit]").forEach((b) => {
    const bit = Number(b.dataset.bit);
    b.onpointerdown = (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add("pressed");
      runtime?.input(bit, true);
    };
    const release = () => {
      b.classList.remove("pressed");
      runtime?.input(bit, false);
    };
    b.onpointerup = b.onpointercancel = b.onlostpointercapture = release;
    b.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        runtime?.input(bit, true);
      }
    };
    b.onkeyup = release;
  });
}
async function start(paid: PaidEntry | null = null) {
  currentPaid = paid;
  clearAudioUI();
  runtime?.destroy();
  runtime = null;
  if (location.pathname != "/app/") history.pushState({}, "", "/app/");
  const runUrl = paid ? "/app/" : "/app/?mode=practice";
  if (location.pathname + location.search !== runUrl)
    history.replaceState({}, "", runUrl);
  title(paid ? "The run" : "Free practice");
  shell();
  const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
  overlay.hidden = false;
  overlay.innerHTML =
    '<div class="run-modal"><h2>Opening the vault…</h2></div>';
  try {
    const queue = paid ? null : practiceMapQueue();
    session = await api("session", {
      engine: VERSION,
      ...(!paid ? { preferredLayout: queue[0] } : {}),
      ...(paid ? { gamePlayId: paid.id } : {}),
    });
    if (session.engine !== VERSION)
      throw Error(
        "The game was updated. Refresh this page to start the new run.",
      );
    if (!paid) {
      const layout = createState(session.seed).layout;
      if (layout !== queue[0])
        throw Error("The map could not be prepared. Try a new run.");
      localStorage.setItem("crumbs-map-queue", JSON.stringify(queue.slice(1)));
      localStorage.setItem("crumbs-last-map", String(layout));
    }
  } catch (e) {
    overlay.innerHTML = `<div class="run-modal"><h2>Vault door jammed.</h2><p>${escape((e as Error).message)}</p><button class="yellow" id="retry">Try again</button><a href="/">Back home</a></div>`;
    document
      .querySelector("#retry")!
      .addEventListener("click", () => start(currentPaid));
    return;
  }
  overlay.hidden = true;
  const { mountGame } = await import("./game");
  runtime = mountGame(
    document.querySelector("#playfield")!,
    session.seed,
    updateHUD,
    finish,
    skin,
    () => {
      overlay.hidden = false;
      overlay.innerHTML = `<div class="run-modal"><h2>${MAPS[createState(session.seed).layout].name}</h2><p>Collect all 36 gold crumbs to clear the map. Three catches end your run.</p><p>Hold the arrow buttons or use WASD / arrow keys in any keyboard layout. Hold a direction and press Dash to escape. Green crumbs give five seconds of speed.</p>${paid ? "" : '<p class="small">Free practice. No wallet, entry fee or BNB prizes.</p>'}<button class="yellow" id="begin-run">${paid ? "Start run" : "Start free run"}</button><a href="/">Back home</a></div>`;
      document.querySelector<HTMLButtonElement>("#begin-run")!.onclick = () =>
        runtime?.pause(false);
    },
  );
}
function updateHUD(s: GameState) {
  const field = document.querySelector<HTMLElement>("#playfield");
  if (field) {
    field.dataset.layout = String(s.layout);
    field.dataset.playerX = s.x.toFixed(2);
    field.dataset.playerY = s.y.toFixed(2);
  }
  const lives = document.querySelector("#lives");
  if (lives) {
    lives.textContent =
      "♥".repeat(Math.max(0, 3 - s.hits)) + "♡".repeat(Math.min(3, s.hits));
    lives.setAttribute(
      "aria-label",
      `${Math.max(0, 3 - s.hits)} catches remaining`,
    );
  }
  document.querySelector("#carry")!.textContent =
    s.collected + "/" + s.crumbs.length;
  const seconds = Math.max(0, Math.ceil((2700 - s.tick) / 60));
  document.querySelector("#clock")!.textContent =
    "00:" + String(seconds).padStart(2, "0");
  const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
  if (s.phase === "playing" && s.paused) {
    overlay.hidden = false;
    overlay.innerHTML =
      '<div class="run-modal"><h2>Catch your breath.</h2><button class="yellow" id="resume">Keep going</button><button id="restart">Start a new run</button><a href="/">Leave the vault</a></div>';
    document.querySelector("#resume")!.addEventListener("click", () => {
      overlay.hidden = true;
      runtime?.pause(false);
    });
    document.querySelector("#restart")!.addEventListener("click", chooseMode);
  } else if (s.phase === "playing") overlay.hidden = true;
  const chased = s.bots.some((b) => b.active && b.mode === "chase");
  document.querySelector("#ability-state")!.textContent =
    s.tick < s.speedUntil
      ? "Speed boost " +
        ((s.speedUntil - s.tick) / 60).toFixed(1) +
        "s" +
        (chased ? " · Chased" : "")
      : s.tick < s.shieldUntil
        ? "Low Gas shield"
        : chased
          ? "Guards on your tail!"
          : s.tick >= 855 && s.tick < 1020
            ? "Extra guard incoming"
            : s.tick < s.whaleUntil
              ? "Whale Alert"
              : s.tick < s.dashReady
                ? "Dash recharging"
                : "";
  const dash = document.querySelector<HTMLButtonElement>("#dash")!;
  dash.disabled = s.tick < s.dashReady;
}
async function finish(result: RunResult) {
  document.querySelector<HTMLButtonElement>("#pause")!.disabled = true;
  const s = result.state,
    won = s.phase === "escaped";
  bestCollected = Math.max(bestCollected, s.collected);
  localStorage.setItem("crumbs-collected", String(bestCollected));
  if (won) {
    clears++;
    localStorage.setItem("crumbs-clears", String(clears));
  }
  if (won && s.score > lastScore) {
    lastScore = s.score;
    localStorage.setItem("crumbs-best", String(lastScore));
  }
  const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
  overlay.hidden = false;
  overlay.innerHTML = `<div class="run-modal result"><img src="/game/${won ? "original" : "guard"}.png" alt=""/><h2>${won ? "All crumbs collected." : "The vault got you."}</h2><div class="result-score">${s.score}<span>points</span></div><p>${won ? s.collected + " crumbs collected. " + s.carry + " kept after catches. " + s.hits + " close calls." : s.hits >= 3 ? "Three catches. The guards got your bag. Dodge behind crates and use Dash to break away." : "Time ran out. Collect every crumb before the clock reaches zero."}</p><p id="verify-status">Checking your run…</p><div class="result-actions">${currentPaid ? '<button class="yellow" id="open-wheel">Draw my BNB return</button>' : ""}<button class="${currentPaid ? "" : "yellow"}" id="again">One more run</button>${currentPaid ? "" : '<button id="paid-next">Play for BNB</button>'}${won ? '<button id="save" disabled>Save record (wallet + gas)</button>' : ""}${won ? '<button id="share" disabled>Share on X</button><a id="download-card" hidden download="crumbs-result.png">Download victory card</a>' : '<button id="copy-result">Copy my result</button>'}<a href="/">Back to the crew</a></div><p class="small" id="claim-status"></p></div>`;
  document
    .querySelector("#again")!
    .addEventListener("click", currentPaid ? chooseMode : () => start());
  document.querySelector("#paid-next")?.addEventListener("click", chooseMode);
  document.querySelector("#open-wheel")?.addEventListener("click", () => {
    clearAudioUI();
    runtime?.destroy();
    runtime = null;
    wheelScreen(root, config, currentPaid.id, lobby);
  });
  document
    .querySelector("#copy-result")
    ?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(
          won
            ? `I escaped the whale vault with ${s.score} points in Crumbs. Whales have bags. We take crumbs.\n${location.origin}`
            : `The guards got me in Crumbs. Next run, bigger bag.\n${location.origin}`,
        );
        document.querySelector("#copy-result")!.textContent = "Copied";
      } catch {
        document.querySelector("#claim-status")!.textContent =
          "Copy is unavailable in this browser.";
      }
    });
  const finishedId = session.id,
    verifyStatus = document.querySelector("#verify-status")!;
  try {
    await api("finish", {
      id: finishedId,
      actions: result.actions,
    });
    if (!verifyStatus.isConnected) return;
    document.querySelector("#verify-status")!.textContent = won
      ? "Run verified."
      : "Run checked. The next bag is yours.";
    const save = document.querySelector<HTMLButtonElement>("#save");
    if (save) {
      save.disabled = !config?.market;
      save.onclick = saveOnchain;
    }
    if (won) {
      try {
        const shared = await api("share", { id: finishedId });
        if (!verifyStatus.isConnected) return;
        const button = document.querySelector<HTMLButtonElement>("#share")!;
        button.disabled = false;
        button.onclick = () =>
          window.open(
            shareIntent(location.origin, finishedId, shared.score),
            "_blank",
            "noopener,noreferrer",
          );
        const download =
          document.querySelector<HTMLAnchorElement>("#download-card")!;
        download.href = shared.image;
        download.hidden = false;
      } catch {
        if (verifyStatus.isConnected)
          document.querySelector("#claim-status")!.textContent =
            "Sharing is temporarily unavailable. Your run is still verified.";
      }
    }
  } catch (e) {
    if (!verifyStatus.isConnected) return;
    document.querySelector("#verify-status")!.textContent =
      "Run verification failed: " + (e as Error).message;
  }
}
async function saveOnchain() {
  const status = document.querySelector("#claim-status")!,
    button = document.querySelector<HTMLButtonElement>("#save")!;
  button.disabled = true;
  try {
    if (!config?.market) throw Error("Onchain records are not configured yet.");
    status.textContent =
      config.stage === "testnet"
        ? "BNB Testnet: this uses test gas. Confirm only if your wallet shows the test network."
        : "Saving uses BNB Chain mainnet gas. The record grants no financial rewards.";
    const signer = await getWallet(config),
      address = await signer.getAddress();
    const challenge = await api("challenge", { id: session.id, address });
    status.textContent =
      "Sign the message to link this run to your wallet. This message does not move funds.";
    const signature = await signer.signMessage(challenge.message);
    const claim = await api("attestation", {
      id: session.id,
      address,
      signature,
      expiry: challenge.expiry,
    });
    status.textContent =
      "Confirm one transaction to save your record. Network gas applies.";
    const { Contract } = await import("ethers");
    const records = new Contract(
      config.market,
      ["function record(uint32,uint32,bytes32,uint64,bytes)"],
      signer,
    );
    const tx = await records.record(
      claim.score,
      claim.season,
      claim.runId,
      claim.deadline,
      claim.signature,
    );
    status.innerHTML = `Record submitted. <a href="${escape(config.explorerUrl)}/tx/${tx.hash}" target="_blank" rel="noreferrer">View transaction</a>`;
    await tx.wait();
    await api("confirm", { id: session.id, transaction: tx.hash });
    status.innerHTML = `Record confirmed on ${escape(config.networkName)}. <a href="${escape(config.explorerUrl)}/tx/${tx.hash}" target="_blank" rel="noreferrer">View transaction</a>`;
    button.textContent = "Record saved";
  } catch (e: any) {
    status.textContent =
      e.code === "ACTION_REJECTED"
        ? "Wallet request declined. Your game result is unchanged."
        : e.shortMessage || e.message;
    button.disabled = false;
  }
}
function docs() {
  title("How to play");
  root.innerHTML = `${header()}<main class="docs"><h1>A little greed.<br/>A quick getaway.</h1><h2>The run</h2><p>You have 45 seconds. Move with WASD or arrow keys, or use the on-screen controls on mobile. Space or Dash gives a short burst with a cooldown. Collect all 36 crumbs to finish immediately. You do not need to return to the burrow.</p><h2>The score</h2><p>Every crumb still in your bag at completion is worth ten points. Whole seconds left on the clock are bonus points. Getting caught by a guard loses half your carried crumbs, rounded down. Three catches end the run. Guards follow you when they see you, search your last known position when you hide behind crates, then return to patrol. Another guard joins after fifteen seconds. A short recovery window prevents repeated hits at once. The final crumb ends the run immediately. If the clock reaches zero before the map is cleared, the run scores zero.</p><h2>The tricks</h2><p>The pale-blue pickup gives a temporary Low Gas shield. Green bonus crumbs give five seconds of movement at 245 units per second, compared with the normal 165. There are three green pickups per map. They do not count toward the 36 gold crumbs. Whale Alert warns you about a short dangerous sweep through the middle of the vault. These are arcade mechanics and do not alter the paid draw odds. Five distinct arenas, each with its own floor and obstacle layout, changing crumbs and guards that chase around crates make each route different. This frustrates fixed click recordings but does not guarantee bot prevention.</p><h2>The crew</h2><p>Crumbs is available from the start. Collect twelve crumbs in one run to unlock Scout. Clear an entire map to unlock Veteran. Characters are cosmetic and do not change scores or movement. Your local best and character choice are saved in this browser.</p><h2>BNB Chain records</h2><p>Practice requires no wallet. Paid play requires a wallet, an entry transaction and network gas. After an escape, the server replays the recorded controls against the original seed and checks the score. Successful clears qualify for the leaderboard. Faster completion and fewer catches mean a higher score. To save a record, connect your wallet, sign the run-linking message and confirm one onchain transaction. You pay network gas. Game crumbs are points. The separate paid draw returns BNB according to fixed odds, regardless of your arcade score.</p><p>The public season board includes records confirmed onchain. The score contract trusts the configured score-signing service. Valid replays prove compliance with game rules, not that a human played without automation. The optional paid draw is a separate chance-based product. Game points and community tokens give no right to additional payments.</p><div id="network-docs">Loading network…</div><h2>Paid draw rules</h2><p>Each paid entry has an independent 40% chance of a gross return above its stake. The fixed bands are: 60% chance of 80.123–95.877% returned; 35% chance of 103.123–107.877%; 4.5% chance of 110.123–119.877%; 0.5% chance of 175.123–224.877%. A second domain-separated value derived from the same verified VRF word determines the exact multiplier uniformly inside the selected band. These amounts include the original entry. Average theoretical return is 95.9% before the player's network fees. A higher gross return can still be a net loss after gas. No profit is guaranteed.</p><p>The stake is denominated in BNB, not a fixed dollar amount. Each accepted entry reserves its maximum payout plus an oracle budget. The owner can withdraw only funds not reserved for open plays and player credits. Oracle fees are paid from the project bank, with a per-request cap of 2% of the entry.</p><p>After the game, request the draw, wait for Chainlink VRF, settle and claim your return. Anyone may request or settle an existing paid draw, but only its player can withdraw the credited BNB. The arcade result does not change or cancel your paid return. A request cannot be rerolled or cancelled. If VRF is delayed, funds remain reserved until fulfillment. If no request was made within 24 hours, the player can recover the full entry. A service outage cannot guarantee a callback time.</p><p>Keep your play ID from the entry transaction. Use Recover a paid run after closing the page. Settlement and withdrawals remain accessible when new entries are paused. Paid play is for adults aged 18 or older and is available only where lawful. Do not use it where chance-based wagering is prohibited. No tokens are required to play.</p><h2>Access and limits</h2><p>The contract owner can rotate the score signer, pause new records and start the next season. These powers apply only to the score-record contract. The separate game bank holds the paid entries and payout reserve. Its owner can pause new paid entries and withdraw unreserved bank funds, but cannot change the fixed odds, entry amount, payouts or VRF wrapper. Historical records remain readable. The contract is unaudited. Crumbs is independent of Binance and BNB Chain's operators.</p><h2 id="audio-credits">Soundtrack</h2><p>“Sneaky Snitch” by Kevin MacLeod (<a href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100772" target="_blank" rel="noopener noreferrer">incompetech.com</a>), licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0</a>. Transcoded to 128 kbps for web playback, looped and played quietly. Game sound effects are original synthesized cues. Use Sound during a run to adjust music and effects or mute both.</p><h2>Project token</h2><p>A community token, if separately launched, does not represent game points, a claim on vault funds, an investment return or a right to prizes.</p><a class="yellow" href="/app/">Play a run</a></main>${footer()}`;
  refreshDocs();
}
function refreshDocs() {
  const target = document.querySelector("#network-docs");
  if (!target || !config) return;
  target.innerHTML = `<h2>${escape(config.networkName)}</h2>${config.stage === "testnet" ? "<p>Public BNB Testnet deployment. Record transactions use tBNB test gas.</p>" : ""}${config.market ? `<p>Record contract: <a href="${escape(config.explorerUrl)}/address/${config.market}">${config.market}</a></p>` : "<p>Record deployment is in preparation. No mainnet contract is claimed.</p>"}${config.game ? `<p>Paid game contract: <a href="${escape(config.explorerUrl)}/address/${config.game.address}">${config.game.address}</a></p>` : ""}`;
}
async function init() {
  try {
    config = await (
      await fetch("/contracts.json", { cache: "no-store" })
    ).json();
  } catch {}
  if (location.pathname.startsWith("/bank") && config?.game)
    bankScreen(root, config);
  else if (location.pathname.startsWith("/docs")) docs();
  else if (location.pathname.startsWith("/app")) {
    const params = new URLSearchParams(location.search);
    const play = params.get("play");
    if (config?.game && /^0x[\da-fA-F]{64}$/.test(play || ""))
      wheelScreen(root, config, play!, chooseMode);
    else if (params.get("mode") === "practice") start();
    else chooseMode();
  } else lobby();
  refreshNetwork();
  refreshDocs();
}
window.addEventListener("popstate", () => {
  stopMoney();
  clearAudioUI();
  runtime?.destroy();
  runtime = null;
  init();
});
init();
