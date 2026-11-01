import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import { resultSvg, shareIntent } from "../shared/share.mjs";
let ready, assets;
const htmlEscape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function loadAssets(env, origin) {
  if (!assets)
    assets = Promise.all(
      ["/fonts/lilitaone.ttf", "/mouse-v1.png"].map(async (path) => {
        const response = await env.ASSETS.fetch(new Request(origin + path));
        if (!response.ok) throw Error("Share artwork is unavailable.");
        return new Uint8Array(await response.arrayBuffer());
      }),
    ).catch((error) => {
      assets = undefined;
      throw error;
    });
  return assets;
}
export async function shareResponse(request, env) {
  const url = new URL(request.url),
    match = /^\/run\/([a-f0-9]{32})\/(card\.png)?$/.exec(url.pathname);
  if (!match || !["GET", "HEAD"].includes(request.method))
    return new Response("Not found", { status: 404 });
  const id = match[1],
    result = await env.DB.prepare(
      "SELECT id,score,crumbs,steps FROM shared_runs WHERE id=?",
    )
      .bind(id)
      .first();
  if (!result)
    return new Response("Shared run not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const base = url.origin + "/run/" + id + "/",
    image = base + "card.png";
  if (match[2]) {
    const cacheKey = new Request(image),
      cached = await caches.default.match(cacheKey);
    if (cached)
      return request.method === "HEAD" ? new Response(null, cached) : cached;
    if (!ready)
      ready = initWasm(wasm).catch((error) => {
        ready = undefined;
        throw error;
      });
    const [, [font, mouse]] = await Promise.all([
      ready,
      loadAssets(env, url.origin),
    ]);
    const renderer = new Resvg(
      resultSvg(
        result,
        "data:image/png;base64," + Buffer.from(mouse).toString("base64"),
      ),
      { font: { fontBuffers: [font], defaultFontFamily: "Lilita One" } },
    );
    let png, rendered;
    try {
      rendered = renderer.render();
      png = rendered.asPng().slice();
    } finally {
      rendered?.free();
      renderer.free();
    }
    const response = new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
    await caches.default.put(cacheKey, response.clone());
    return request.method === "HEAD" ? new Response(null, response) : response;
  }
  const title = `${result.score} points. Tiny paws. Clean getaway.`,
    description = `All 36 crumbs collected in Crumbs. ${result.crumbs} kept after catches. Can you beat this run?`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Crumbs</title><meta name="description" content="${description}"><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${base}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@playcrumbs_bnb"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}"><link rel="canonical" href="${base}"><style>body{margin:0;background:#121416;color:#eee8d9;font:18px system-ui,sans-serif}main{max-width:1000px;margin:50px auto;padding:20px}img{width:100%;height:auto;border-radius:12px}nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}a{color:#121416;background:#f0b90b;padding:14px 24px;border-radius:6px;text-decoration:none}p{line-height:1.6}footer a{background:none;color:#eee8d9;padding:0;font-size:14px}</style></head><body><main><img src="${image}" width="1200" height="630" alt="Crumbs: all crumbs collected, ${result.score} arcade points"><nav><a href="/app/?mode=practice">Beat this run</a><a href="${htmlEscape(shareIntent(url.origin, id, result.score))}" target="_blank" rel="noopener noreferrer">Share on X</a><a href="${image}" download="crumbs-${result.score}.png">Download card</a></nav><p>A verified arcade clear. Practice is free and needs no wallet.</p><footer><a href="https://x.com/playcrumbs_bnb">@playcrumbs_bnb</a></footer></main></body></html>`;
  return new Response(request.method === "HEAD" ? null : html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
