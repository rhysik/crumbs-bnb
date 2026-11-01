import {
  Wallet,
  Contract,
  JsonRpcProvider,
  verifyMessage,
  getAddress,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { createState, replay, VERSION, MAPS } from "../shared/simulation.mjs";
import { replay as replayV2 } from "../shared/simulation-v2.mjs";
import { replay as replayV3 } from "../shared/simulation-v3.mjs";
import { TYPES, domain, challengeMessage } from "../shared/claims.mjs";
const json = (value, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const fail = (message, status = 400) => {
  const e = Error(message);
  e.status = status;
  throw e;
};
async function body(request) {
  const text = await request.text();
  if (text.length > 80000) fail("Run data is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    fail("Invalid request.");
  }
}
async function row(env, id) {
  if (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id))
    fail("Invalid run.");
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?")
    .bind(id)
    .first();
  if (!s) fail("Run not found.", 404);
  if (
    s.chain_id !== Number(env.CHAIN_ID) ||
    s.market.toLowerCase() !== env.RECORD_ADDRESS.toLowerCase() ||
    s.season !== Number(env.SEASON)
  )
    fail("This run belongs to an earlier game configuration. Start a new run.");
  return s;
}
async function recordConfirmation(env, session, hash) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash || "")) fail("Invalid transaction.");
  const p = new JsonRpcProvider(env.RPC_URL);
  if (BigInt(await p.send("eth_chainId", [])) !== BigInt(env.CHAIN_ID))
    fail("Record network is unavailable.", 503);
  const receipt = await p.getTransactionReceipt(hash);
  if (
    !receipt ||
    receipt.status !== 1 ||
    receipt.to?.toLowerCase() !== env.RECORD_ADDRESS.toLowerCase()
  )
    fail("Record transaction is not confirmed.");
  const contract = new Contract(
    env.RECORD_ADDRESS,
    [
      "event RecordSaved(address indexed player,uint32 indexed season,bytes32 indexed runId,uint32 score,uint8 badges)",
    ],
    p,
  );
  let event;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== env.RECORD_ADDRESS.toLowerCase())
      continue;
    try {
      const v = contract.interface.parseLog(log);
      if (
        v?.name === "RecordSaved" &&
        v.args.runId === keccak256(toUtf8Bytes(session.id))
      )
        event = v.args;
    } catch {}
  }
  if (
    !event ||
    event.player.toLowerCase() !== session.owner?.toLowerCase() ||
    Number(event.score) !== session.score ||
    Number(event.season) !== Number(env.SEASON)
  )
    fail("Transaction does not match this verified run.");
  await env.DB.batch([
    saveRecord(
      env,
      session.owner,
      Number(env.SEASON),
      session.score,
      hash,
      Date.now(),
    ),
    env.DB.prepare("UPDATE sessions SET transaction_hash=? WHERE id=?").bind(
      hash,
      session.id,
    ),
  ]);
  return { confirmed: true, score: session.score };
}
function saveRecord(env, player, season, score, hash, updated) {
  return env.DB.prepare(
    "INSERT INTO records(chain_id,market,player,season,score,transaction_hash,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(chain_id,market,player,season) DO UPDATE SET score=MAX(records.score,excluded.score),transaction_hash=CASE WHEN excluded.score>records.score THEN excluded.transaction_hash ELSE records.transaction_hash END,updated=CASE WHEN excluded.score>records.score THEN excluded.updated ELSE records.updated END",
  ).bind(
    Number(env.CHAIN_ID),
    env.RECORD_ADDRESS.toLowerCase(),
    player.toLowerCase(),
    season,
    score,
    hash,
    updated,
  );
}
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const p = new JsonRpcProvider(env.RPC_URL);
        if (BigInt(await p.send("eth_chainId", [])) !== BigInt(env.CHAIN_ID))
          throw Error("Wrong indexer chain");
        const key = env.CHAIN_ID + ":" + env.RECORD_ADDRESS;
        const meta = await env.DB.prepare(
          "SELECT value FROM metadata WHERE key=?",
        )
          .bind(key)
          .first();
        const latest = (await p.getBlockNumber()) - 2,
          from = meta ? Number(meta.value) + 1 : Number(env.DEPLOYMENT_BLOCK);
        if (from > latest) return;
        const to = Math.min(latest, from + 1500);
        const contract = new Contract(
          env.RECORD_ADDRESS,
          [
            "event RecordSaved(address indexed player,uint32 indexed season,bytes32 indexed runId,uint32 score,uint8 badges)",
          ],
          p,
        );
        const logs = await contract.queryFilter(
          contract.filters.RecordSaved(),
          from,
          to,
        );
        for (const log of logs) {
          await saveRecord(
            env,
            log.args.player,
            Number(log.args.season),
            Number(log.args.score),
            log.transactionHash,
            Number(log.blockNumber) * 1000,
          ).run();
        }
        await env.DB.prepare(
          "INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
          .bind(key, String(to))
          .run();
        await env.DB.prepare(
          "DELETE FROM sessions WHERE expires<? AND transaction_hash IS NULL",
        )
          .bind(Date.now() - 86400000)
          .run();
        await env.DB.prepare("DELETE FROM rate_limits WHERE expires<?")
          .bind(Date.now())
          .run();
      })(),
    );
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (request.method === "POST") {
        const origin = request.headers.get("Origin");
        if (origin && origin !== url.origin) fail("Origin mismatch.", 403);
      }
      const endpoint = url.pathname.slice(5);
      if (endpoint === "health")
        return json({
          engine: VERSION,
          chainId: Number(env.CHAIN_ID),
          market: env.RECORD_ADDRESS,
          scoreService: !!env.SCORE_KEY,
          season: Number(env.SEASON),
        });
      if (endpoint === "leaderboard" && request.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT player,score,transaction_hash FROM records WHERE chain_id=? AND market=? AND season=? ORDER BY score DESC,updated ASC LIMIT 30",
        )
          .bind(
            Number(env.CHAIN_ID),
            env.RECORD_ADDRESS.toLowerCase(),
            Number(env.SEASON),
          )
          .all();
        return json({ season: Number(env.SEASON), records: rows.results });
      }
      if (endpoint === "session" && request.method === "POST") {
        const hour = Math.floor(Date.now() / 3600000),
          ip = request.headers.get("CF-Connecting-IP") || "local";
        const key = keccak256(
          toUtf8Bytes(ip + "|" + hour + "|" + env.RATE_SALT),
        );
        await env.DB.prepare(
          "INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
        )
          .bind(key, Date.now() + 3600000)
          .run();
        const limit = await env.DB.prepare(
          "SELECT count FROM rate_limits WHERE key=?",
        )
          .bind(key)
          .first();
        if (limit.count > 180)
          fail("Too many runs this hour. Come back shortly.", 429);
        const b = await body(request);
        if (b.engine !== VERSION)
          fail(
            "The game was updated. Refresh the page before starting a new run.",
            409,
          );
        let seed = crypto.getRandomValues(new Uint32Array(1))[0],
          owner = null;
        if (
          !b.gamePlayId &&
          Number.isInteger(b.preferredLayout) &&
          b.preferredLayout >= 0 &&
          b.preferredLayout < MAPS.length
        ) {
          while (createState(seed).layout !== b.preferredLayout)
            seed = (seed + 1) >>> 0;
        }
        if (b.gamePlayId) {
          if (!/^0x[a-fA-F0-9]{64}$/.test(b.gamePlayId) || !env.GAME_ADDRESS)
            fail("Invalid paid entry.");
          const p = new JsonRpcProvider(env.RPC_URL);
          const game = new Contract(
            env.GAME_ADDRESS,
            [
              "function plays(bytes32) view returns(address player,uint64 enteredAt,uint32 seed,uint8 state,uint256 requestId,uint256 randomWord,uint256 oracleFee,uint256 payout)",
            ],
            p,
          );
          const play = await game.plays(b.gamePlayId);
          if (play.player === "0x0000000000000000000000000000000000000000")
            fail("Paid entry is not confirmed.");
          seed = Number(play.seed);
          owner = play.player.toLowerCase();
        }
        const id = crypto.randomUUID().replaceAll("-", "");
        const now = Date.now();
        await env.DB.prepare(
          "INSERT INTO sessions(id,seed,created,chain_id,market,season,expires,owner,engine) VALUES(?,?,?,?,?,?,?,?,?)",
        )
          .bind(
            id,
            seed,
            now,
            Number(env.CHAIN_ID),
            env.RECORD_ADDRESS.toLowerCase(),
            Number(env.SEASON),
            now + 1200000,
            owner,
            VERSION,
          )
          .run();
        return json({
          id,
          seed,
          engine: VERSION,
          layout: createState(seed).layout,
          season: Number(env.SEASON),
        });
      }
      if (endpoint === "finish" && request.method === "POST") {
        const b = await body(request),
          s = await row(env, b.id);
        if (Date.now() > s.expires) fail("Run expired. Start another run.");
        const result =
          s.engine === 2
            ? replayV2(s.seed, b.actions)
            : s.engine === 3
              ? replayV3(s.seed, b.actions)
              : replay(s.seed, b.actions);
        if (Date.now() - s.created < (result.tick * 1000) / 60 - 1500)
          fail("Run finished faster than its valid simulation time.");
        const hash = keccak256(toUtf8Bytes(JSON.stringify(b.actions)));
        if (s.finished && s.replay_hash !== hash)
          fail("This run already has a different result.");
        await env.DB.prepare(
          "UPDATE sessions SET finished=1,score=?,crumbs=?,steps=?,replay_hash=? WHERE id=? AND (finished=0 OR replay_hash=?)",
        )
          .bind(result.score, result.carry, result.tick, hash, s.id, hash)
          .run();
        return json({
          verified: true,
          score: result.score,
          escaped: result.phase === "escaped",
          crumbs: result.carry,
        });
      }
      if (endpoint === "challenge" && request.method === "POST") {
        const b = await body(request),
          s = await row(env, b.id);
        if (!s.finished || s.score <= 0)
          fail("Escape and verify this run first.");
        const address = getAddress(b.address),
          expiry = Math.floor(Date.now() / 1000) + 300;
        return json({
          message: challengeMessage({
            origin: url.origin,
            id: s.id,
            address,
            score: s.score,
            chainId: env.CHAIN_ID,
            expiry,
          }),
          expiry,
        });
      }
      if (endpoint === "attestation" && request.method === "POST") {
        const b = await body(request),
          s = await row(env, b.id);
        if (!s.finished || s.score <= 0 || Date.now() > s.expires)
          fail("Verified run is unavailable.");
        const address = getAddress(b.address);
        if (
          !Number.isInteger(b.expiry) ||
          b.expiry < Math.floor(Date.now() / 1000) ||
          b.expiry > Math.floor(Date.now() / 1000) + 310
        )
          fail("Wallet message expired.");
        const message = challengeMessage({
          origin: url.origin,
          id: s.id,
          address,
          score: s.score,
          chainId: env.CHAIN_ID,
          expiry: b.expiry,
        });
        if (
          verifyMessage(message, b.signature).toLowerCase() !==
          address.toLowerCase()
        )
          fail("Wallet signature does not match.", 403);
        const deadline =
            s.claim_deadline || Math.floor(Date.now() / 1000) + 86400,
          runId = keccak256(toUtf8Bytes(s.id));
        if (s.owner && s.owner.toLowerCase() !== address.toLowerCase())
          fail("Run is already linked to another wallet.");
        if (!env.SCORE_KEY || !env.RECORD_ADDRESS)
          fail("Onchain records are not configured.", 503);
        const signature =
          s.claim_signature ||
          (await new Wallet(env.SCORE_KEY).signTypedData(
            domain(env.CHAIN_ID, env.RECORD_ADDRESS),
            TYPES,
            {
              player: address,
              score: s.score,
              season: Number(env.SEASON),
              runId,
              deadline,
            },
          ));
        const update = await env.DB.prepare(
          "UPDATE sessions SET owner=?,claim_signature=?,claim_deadline=? WHERE id=? AND (owner IS NULL OR owner=?)",
        )
          .bind(
            address.toLowerCase(),
            signature,
            deadline,
            s.id,
            address.toLowerCase(),
          )
          .run();
        if (!update.meta.changes) fail("Run is already linked.");
        return json({
          score: s.score,
          season: Number(env.SEASON),
          runId,
          deadline,
          signature,
        });
      }
      if (endpoint === "confirm" && request.method === "POST") {
        const b = await body(request),
          s = await row(env, b.id);
        if (!s.owner) fail("Link your run first.");
        return json(await recordConfirmation(env, s, b.transaction));
      }
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json(
        {
          error: e.status
            ? e.message
            : e.code === "INVALID_ARGUMENT"
              ? "Invalid wallet request."
              : "The game service could not complete this request.",
        },
        e.status || 400,
      );
    }
  },
};
