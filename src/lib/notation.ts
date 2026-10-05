import type { PastRace } from "./types";

// 通過順: 1〜2桁の数字を "-" で2〜4個つないだもの。日付・タイム・馬体重の一部は前後の文字で除外する
const PASSING_RE = /(?<![\d.:\-/])(\d{1,2}(?:-\d{1,2}){1,3})(?![\d.:\-])(?:\/(\d{1,2}))?/g;
const FIELD_RE = /(\d{1,2})\s*頭/g;

/**
 * テキストから過去走の通過順を取り出す。手入力でもサイトからの貼り付けでも使える。
 *   手入力: "3-3-2-1/16 5-4/14" ("/" の後ろは頭数、省略可)
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
    const fieldSize = m[2] ? Number(m[2]) : lastFieldSize(s.slice(lastEnd, start));
    if (fieldSize && passing.some((n) => n > fieldSize)) continue;
    races.push({ passing, fieldSize });
    lastEnd = start + m[0].length;
  }
  return races;
}

function lastFieldSize(segment: string): number | undefined {
  let found: number | undefined;
  for (const m of segment.matchAll(FIELD_RE)) found = Number(m[1]);
  return found && found >= 2 && found <= 18 ? found : undefined;
}

export function formatPassingText(races: PastRace[]): string {
  return races
    .filter((r) => r.passing.length > 0)
    .map((r) => r.passing.join("-") + (r.fieldSize ? `/${r.fieldSize}` : ""))
    .join(" ");
}

/** 全角数字・全角記号を半角にそろえ、数字の間の長音やダッシュを "-" にする */
export function normalize(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[／]/g, "/")
    .replace(/(?<=\d)\s*[-－ー―‐−]\s*(?=\d)/g, "-");
}
