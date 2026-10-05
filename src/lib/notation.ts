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
  const races: PastRace[] = [];
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
    races.push({ passing, fieldSize, ...lastCourse(segment), ...(last3f ? { last3f } : {}) });
    lastEnd = end;
  }
  return races;
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
