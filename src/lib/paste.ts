import { frameOf } from "./frame";
import { normalize, parsePassingText } from "./notation";
import type { Horse } from "./types";

// JRA の馬名はカタカナ2〜9文字
const NAME_RE = /^[ァ-ヴー]{2,9}$/;

export interface PasteResult {
  horses: Horse[];
  withPassing: number; // 通過順が取れた頭数
  withJockey: number; // 騎手名が取れた頭数
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
      if (i < 0) return h;
      const jockey = jockeyAfter(tokens, anchors[i].idx);
      return {
        ...h,
        ...(races[i].length > 0 ? { pastRaces: races[i] } : {}),
        ...(jockey ? { jockey } : {}),
      };
    });
    return {
      horses: updated,
      withPassing: races.filter((r) => r.length > 0).length,
      withJockey: anchors.filter((a) => jockeyAfter(tokens, a.idx)).length,
      mode: "update",
    };
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
      ...(e.jockey ? { jockey: e.jockey } : {}),
    }))
    .sort((a, b) => a.number - b.number);
  return {
    horses,
    withPassing: races.filter((r) => r.length > 0).length,
    withJockey: horses.filter((h) => h.jockey).length,
    mode: "new",
  };
}

/** 表の馬名を目印にテキストを馬ごとの区間に分ける (見つからない馬は含まない) */
export function splitByHorseNames(text: string, horses: Horse[]): { horse: Horse; segment: string }[] {
  const anchors = findKnownAnchors(tokenize(text), horses.filter((h) => h.name));
  return anchors.map((a, i) => ({ horse: a.horse, segment: text.slice(a.pos, anchors[i + 1]?.pos ?? text.length) }));
}

/** 「馬番 馬名」の並びでテキストを馬ごとの区間に分ける (表に馬がいないとき用) */
export function splitByEntries(text: string): { number: number; name: string; segment: string }[] {
  const entries = findEntries(tokenize(text));
  return entries.map((e, i) => ({
    number: e.number,
    name: e.name,
    segment: text.slice(e.pos, entries[i + 1]?.pos ?? text.length),
  }));
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
  const anchors: { horse: Horse; pos: number; idx: number }[] = [];
  let from = 0;
  for (const h of [...horses].sort((a, b) => a.number - b.number)) {
    const idx = tokens.findIndex((t, i) => i >= from && t.text === h.name);
    if (idx < 0) continue;
    anchors.push({ horse: h, pos: tokens[idx].start, idx });
    from = idx + 1;
  }
  return anchors;
}

/** 「(枠) 馬番 馬名」の並びを探す。馬番は1から順に増えていくものだけ採用する */
function findEntries(tokens: Token[]) {
  const entries: { number: number; frame?: number; name: string; pos: number; jockey?: string }[] = [];
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
    entries.push({ number, frame, name: t.text, pos: t.start, jockey: jockeyAfter(tokens, i) });
  });
  return entries;
}

// 斤量: "56.0" "56" "56kg" "▲54" など (48〜63kg)
const WEIGHT_RE = /^[▲△☆★◇◆]?(\d{2}(?:\.\d)?)(?:kg|ｋｇ|キロ)?$/;
const MARK_RE = /^[▲△☆★◇◆]/;
// 騎手名ではない語 (性齢・毛色・所属など)
const NOT_JOCKEY_RE = /^(牡|牝|セ|騸|せん)|毛$|^(美|栗|地|外|父|母|厩舎|調教師|馬主|生産)|[()（）［］\[\]:：]/;

function isJockeyName(text: string): boolean {
  const t = text.replace(MARK_RE, "");
  return /^[^\d\s]{2,8}$/.test(t) && !NOT_JOCKEY_RE.test(t);
}

function weightOf(text: string): number | undefined {
  const m = WEIGHT_RE.exec(text);
  const w = m ? Number(m[1]) : NaN;
  return w >= 48 && w <= 63 ? w : undefined;
}

/**
 * 馬名の後ろから今回の騎手名を拾う。次の書き方に対応する:
 *   "騎手 森泰斗" "騎手:森泰斗" (見出し付き)
 *   "56.0 森泰斗" "56 ▲小林" (斤量の後ろ)
 *   "森泰斗 56.0" (斤量の前)
 * 過去走の欄にも騎手名は出てくるので、馬名に一番近いものを今回の騎手とする。
 */
function jockeyAfter(tokens: Token[], nameIdx: number): string | undefined {
  const end = Math.min(tokens.length, nameIdx + 12);
  for (let i = nameIdx + 1; i < end; i++) {
    const t = tokens[i].text;
    const labeled = /^騎手[:：]?(.*)$/.exec(t);
    if (labeled) {
      const name = labeled[1] || tokens[i + 1]?.text;
      if (name && isJockeyName(name)) return name.replace(MARK_RE, "");
      continue;
    }
    if (weightOf(t) === undefined) continue;
    const next = tokens[i + 1]?.text;
    if (next && isJockeyName(next)) return next.replace(MARK_RE, "");
    const prev = tokens[i - 1]?.text;
    if (i - 1 > nameIdx && prev && isJockeyName(prev)) return prev.replace(MARK_RE, "");
    return undefined;
  }
  return undefined;
}

/** 目印の位置で区切り、それぞれの区間から通過順を取り出す */
function racesBetween(text: string, positions: number[]) {
  return positions.map((pos, i) => parsePassingText(text.slice(pos, positions[i + 1] ?? text.length)));
}
