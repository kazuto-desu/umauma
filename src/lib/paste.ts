import { frameOf } from "./frame";
import { normalize, parsePassingText } from "./notation";
import type { Horse } from "./types";

// JRA の馬名はカタカナ2〜9文字
const NAME_RE = /^[ァ-ヴー]{2,9}$/;

export interface PasteResult {
  horses: Horse[];
  withPassing: number; // 通過順が取れた頭数
  mode: "update" | "new";
}

/**
 * サイトの出馬表・馬柱をコピーしたテキストから出走馬と過去の通過順を取り出す。
 * 今の表に馬名が入っていて貼り付けにその馬名が多く含まれていれば、その馬名を目印に通過順だけ更新する。
 * そうでなければ「馬番 → カタカナの馬名」の並びから出走馬を作り直す。
 */
export function parsePastedCard(text: string, current: Horse[]): PasteResult | null {
  const tokens = tokenize(text);

  const known = current.filter((h) => h.name);
  const anchors = findKnownAnchors(tokens, known);
  if (known.length > 0 && anchors.length >= Math.ceil(known.length / 2)) {
    const races = racesBetween(text, anchors.map((a) => a.pos));
    const updated = current.map((h) => {
      const i = anchors.findIndex((a) => a.horse === h);
      return i >= 0 && races[i].length > 0 ? { ...h, pastRaces: races[i] } : h;
    });
    return { horses: updated, withPassing: races.filter((r) => r.length > 0).length, mode: "update" };
  }

  const entries = findEntries(tokens);
  if (entries.length < 2) return null;
  const races = racesBetween(text, entries.map((e) => e.pos));
  const fieldSize = entries.length;
  const horses = entries
    .map((e, i) => ({
      number: e.number,
      frame: e.frame ?? frameOf(e.number, fieldSize),
      name: e.name,
      pastRaces: races[i],
    }))
    .sort((a, b) => a.number - b.number);
  return { horses, withPassing: races.filter((r) => r.length > 0).length, mode: "new" };
}

interface Token {
  text: string;
  start: number; // 元テキスト中の位置
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(/\S+/g)) tokens.push({ text: normalize(m[0]), start: m.index ?? 0 });
  return tokens;
}

/** 表にある馬名が単独の語として出てくる位置を、馬番順に前から探す */
function findKnownAnchors(tokens: Token[], horses: Horse[]) {
  const anchors: { horse: Horse; pos: number }[] = [];
  let from = 0;
  for (const h of [...horses].sort((a, b) => a.number - b.number)) {
    const idx = tokens.findIndex((t, i) => i >= from && t.text === h.name);
    if (idx < 0) continue;
    anchors.push({ horse: h, pos: tokens[idx].start });
    from = idx + 1;
  }
  return anchors;
}

/** 「(枠) 馬番 馬名」の並びを探す。馬番は1から順に増えていくものだけ採用する */
function findEntries(tokens: Token[]) {
  const entries: { number: number; frame?: number; name: string; pos: number }[] = [];
  const used = new Set<number>();
  tokens.forEach((t, i) => {
    if (!NAME_RE.test(t.text)) return;
    const prev = tokens.slice(Math.max(0, i - 3), i).map((p) => p.text);
    const nums = prev.filter((p) => /^\d{1,2}$/.test(p)).map(Number);
    if (nums.length === 0 || !/^\d{1,2}$/.test(prev[prev.length - 1] ?? "")) return;
    const number = nums[nums.length - 1];
    if (number < 1 || number > 18 || used.has(number)) return;
    if (entries.length > 0 && number < entries[entries.length - 1].number) return;
    const frame = nums.length >= 2 && nums[nums.length - 2] <= 8 ? nums[nums.length - 2] : undefined;
    used.add(number);
    entries.push({ number, frame, name: t.text, pos: t.start });
  });
  return entries;
}

/** 目印の位置で区切り、それぞれの区間から通過順を取り出す */
function racesBetween(text: string, positions: number[]) {
  return positions.map((pos, i) => parsePassingText(text.slice(pos, positions[i + 1] ?? text.length)));
}
