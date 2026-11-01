export function shareRecord(session) {
  if (!/^[a-f0-9]{32}$/.test(session.id) || session.engine !== 4)
    throw Error("Share a clear from the current game version.");
  if (
    !session.finished ||
    !Number.isInteger(session.score) ||
    session.score <= 0 ||
    session.score > 405
  )
    throw Error("Clear and verify the run before sharing it.");
  if (
    !Number.isInteger(session.crumbs) ||
    session.crumbs < 0 ||
    session.crumbs > 36 ||
    !Number.isInteger(session.steps) ||
    session.steps < 1 ||
    session.steps > 2700
  )
    throw Error("Invalid verified run.");
  return {
    id: session.id,
    score: session.score,
    crumbs: session.crumbs,
    steps: session.steps,
  };
}
export function shareText(score) {
  return `Tiny paws. Clean getaway. 🐭\n\nI cleared the vault with ${score} points in @playcrumbs_bnb. Your move, little mouse.`;
}
export function shareIntent(origin, id, score) {
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", shareText(score));
  url.searchParams.set("url", `${origin}/run/${id}/`);
  return url.href;
}
export function resultSvg(result, mouseData) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#eee8d9"/><rect x="26" y="26" width="1148" height="578" rx="22" fill="none" stroke="#121416" stroke-width="3"/><g font-family="Lilita One" fill="#121416"><text x="76" y="103" font-size="48">crumbs</text><text x="76" y="205" font-size="61">All crumbs collected.</text><text x="70" y="365" font-size="152">${result.score}</text><text x="76" y="411" font-size="28">ARCADE POINTS</text><text x="76" y="482" font-size="31">36 collected · ${result.crumbs} kept</text><text x="76" y="555" font-size="26">@playcrumbs_bnb · playcrumbs.xyz</text></g><path d="M740 510 Q900 430 1100 490" fill="none" stroke="#f0b90b" stroke-width="9" stroke-linecap="round"/><image x="810" y="115" width="300" height="407" xlink:href="${mouseData}"/></svg>`;
}
