import { classOf, marginSeconds } from "./form";
import type { PastRace } from "./types";

// 通過順: 1〜2桁の数字を "-" で2〜4個つないだもの。日付・タイム・馬体重の一部は前後の文字で除外する
const PASSING_RE = /(?<![\d.:\-/])(\d{1,2}(?:-\d{1,2}){1,3})(?![\d.:\-])(?:\/(\d{1,2}))?/g;
const FIELD_RE = /(\d{1,2})\s*頭/g;
// 馬場と距離: "芝1800" "ダ1200" "芝外1600" "ダ右 1700m" など
const COURSE_RE = /(芝|ダ|障)[右左外内直線・]{0,3}\s?(\d{4})/g;
// 通過順の直後の上がり3F: "(34.5)" "上り34.5" "34.5" など
const LAST3F_RE = /^\s*[(（]?\s*(?:上[りが]り?\s*(?:3F)?\s*)?(\d{2}\.\d)\s*[)）]?/;

/**
 * テキストから過去走の通過順を取り出す。手入力でもサイトからの貼り付けでも使える。
 *   手入力: "3-3-2-1/16(34.5) 5-4/14" ("/" の後ろは頭数、( ) は上がり3F。どちらも省略可)
 *   貼り付け: "16頭 7番 2人 ... 3-3-2-1 ..." (直前の「○頭」を頭数として拾う)
 */
export function parsePassingText(text: string): PastRace[] {
  const s = normalize(text);
  const found: { race: PastRace; start: number; end: number; segment: string }[] = [];
  let lastEnd = 0;
  for (const m of s.matchAll(PASSING_RE)) {
    const passing = m[1].split("-").map(Number);
    const start = m.index ?? 0;
    // 0 を含むものは通過順ではない (着度数 "2-1-0-3" など)
    if (passing.some((n) => n < 1 || n > 18)) continue;
    const segment = s.slice(lastEnd, start);
    const fieldSize = m[2] ? Number(m[2]) : lastFieldSize(segment);
    if (fieldSize && passing.some((n) => n > fieldSize)) continue;
    const end = start + m[0].length;
    const f = LAST3F_RE.exec(s.slice(end, end + 20));
    const last3f = f && Number(f[1]) >= 30 && Number(f[1]) <= 45 ? Number(f[1]) : undefined;
    found.push({ race: { passing, fieldSize, ...lastCourse(segment), ...(last3f ? { last3f } : {}) }, start, end, segment });
    lastEnd = end;
  }
  // 着順・クラスは通過順の前 (レース名のあたり)、着差は通過順の後ろ (勝ち馬名のあたり) から拾う
  return found.map(({ race, end, segment }, i) => {
    const head = segment.slice(-160);
    const finish = finishOf(head, race.fieldSize);
    const cls = classOf(head);
    const tail = cutAtNextRace(s.slice(end, found[i + 1]?.start ?? s.length));
    const margin = finish === 1 ? 0 : marginOf(tail);
    return {
      ...race,
      ...(finish ? { finish } : {}),
      ...(finish && margin !== undefined ? { margin } : {}),
      ...(cls ? { className: cls.name, classLevel: cls.level } : {}),
    };
  });
}

const DATE_RE = /\d{4}[./年]\d{1,2}[./月]\d{1,2}|\d{2}[./]\d{1,2}[./]\d{1,2}/;

/**
 * 着順を探す。
 *   "3着" (着差・着度数の「着」は除く)
 *   日付の行の次に数字だけの行 (netkeiba の馬柱: "2024.10.13 東京11" の次の行 "3")
 */
function finishOf(head: string, fieldSize?: number): number | undefined {
  const ok = (n: number) => n >= 1 && n <= (fieldSize ?? 18);
  let found: number | undefined;
  for (const m of head.matchAll(/(?<![\d.])(\d{1,2})\s?着(?![差順度])/g)) if (ok(Number(m[1]))) found = Number(m[1]);
  if (found) return found;
  const lines = head.split("\n").map((l) => l.trim());
  for (let i = lines.length - 2; i >= 0; i--) {
    if (DATE_RE.test(lines[i]) && /^\d{1,2}$/.test(lines[i + 1]) && ok(Number(lines[i + 1]))) return Number(lines[i + 1]);
  }
  return undefined;
}

/** 通過順の後ろから次のレースの日付の手前までを残す */
function cutAtNextRace(tail: string): string {
  const d = DATE_RE.exec(tail);
  return (d ? tail.slice(0, d.index) : tail).slice(0, 120);
}

/** 着差: 勝ち馬名の後ろの "(0.3)" や、"着差 クビ" "着差0.2" */
function marginOf(tail: string): number | undefined {
  const paren = /[(（](-?\d\.\d)[)）]/.exec(tail.replace(/^\s*[(（]?\d{2}\.\d[)）]?/, ""));
  if (paren) return Math.abs(Number(paren[1]));
  const labeled = /着差[:：]?\s*(\S+)/.exec(tail);
  return labeled ? marginSeconds(labeled[1]) : undefined;
}

function lastFieldSize(segment: string): number | undefined {
  let found: number | undefined;
  for (const m of segment.matchAll(FIELD_RE)) found = Number(m[1]);
  return found && found >= 2 && found <= 18 ? found : undefined;
}

function lastCourse(segment: string): Pick<PastRace, "surface" | "distance"> {
  let found: Pick<PastRace, "surface" | "distance"> = {};
  for (const m of segment.matchAll(COURSE_RE)) {
    const distance = Number(m[2]);
    if (distance >= 800 && distance <= 4300) found = { surface: m[1] as PastRace["surface"], distance };
  }
  return found;
}

export function formatPassingText(races: PastRace[]): string {
  return races
    .filter((r) => r.passing.length > 0)
    .map((r) => r.passing.join("-") + (r.fieldSize ? `/${r.fieldSize}` : "") + (r.last3f ? `(${r.last3f})` : ""))
    .join(" ");
}

/** 全角数字・全角記号を半角にそろえ、数字の間の長音やダッシュを "-" にする */
export function normalize(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[／]/g, "/")
    .replace(/(?<=\d)\s*[-－ー―‐−]\s*(?=\d)/g, "-");
}
