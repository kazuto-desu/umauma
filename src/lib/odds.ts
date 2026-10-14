import { parseNarCard } from "./narCard";
import type { Horse } from "./types";

const ODDS_RE = /^\d{1,4}\.\d$/;
const POPULARITY_RE = /^\d{1,2}(人気)?$/;

/**
 * オッズのページや出馬表を貼り付けたテキストから単勝オッズを取り出す (馬番 → オッズ)。
 *   馬名の後ろの "54.9" (後ろに人気 "9" "9人気" があればそれを優先)
 *   馬名がないときは「馬番 オッズ」の行 ("1 54.9")
 * 斤量 (54.0 など) と取り違えないように、人気が続く数字を優先し、なければ「.0 で終わる 48〜63」を避ける。
 */
export function parseOdds(text: string, horses: Horse[]): Map<number, number> {
  const s = text.replace(/[０-９．]/g, (c) => (c === "．" ? "." : String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  const out = new Map<number, number>();

  // 地方の馬柱 (オッズが馬名より前にある形) はその読み方で
  const card = parseNarCard(text).filter((c) => c.odds);
  if (card.length >= 2) {
    for (const c of card) {
      const h = horses.find((x) => (x.name && x.name === c.name) || (!x.name && x.number === c.number));
      if (h) out.set(h.number, c.odds!);
    }
    if (out.size >= 2) return out;
  }

  const named = horses.filter((h) => h.name);
  const positions = named
    .map((h) => ({ h, pos: s.indexOf(h.name) }))
    .filter((x) => x.pos >= 0)
    .sort((a, b) => a.pos - b.pos);
  positions.forEach(({ h, pos }, k) => {
    const end = positions[k + 1]?.pos ?? s.length;
    const odds = pickOdds(s.slice(pos + h.name.length, Math.min(end, pos + h.name.length + 400)).split(/\s+/).filter(Boolean));
    if (odds !== undefined) out.set(h.number, odds);
  });
  if (out.size >= 2) return out;

  for (const m of s.matchAll(/^\s*(\d{1,2})\s+(\d{1,4}\.\d)\s*$/gm)) {
    const number = Number(m[1]);
    if (horses.some((h) => h.number === number)) out.set(number, Number(m[2]));
  }
  return out;
}

function pickOdds(tokens: string[]): number | undefined {
  const candidates = tokens.map((t, i) => ({ t, i })).filter(({ t }) => ODDS_RE.test(t) && Number(t) >= 1);
  const withPopularity = candidates.find(({ i }) => POPULARITY_RE.test(tokens[i + 1] ?? ""));
  if (withPopularity) return Number(withPopularity.t);
  const notWeight = candidates.find(({ t }) => !(/\.0$/.test(t) && Number(t) >= 48 && Number(t) <= 63));
  return notWeight ? Number(notWeight.t) : undefined;
}
