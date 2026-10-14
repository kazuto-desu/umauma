import type { Horse, Paddock } from "./types";

/**
 * パドック評価を貼り付けたテキストを読む。
 *   A                               ← 評価
 *   ⑤リザンテラ  494(-5)  3.3       ← 馬番 (丸数字)・馬名・馬体重 (増減)・単勝オッズ
 *   毛ヅヤ良化上昇ムード  －          ← 短評
 */
export function parsePaddock(text: string): (Paddock & { number: number; name: string; odds?: number })[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim());
  const out: (Paddock & { number: number; name: string; odds?: number })[] = [];
  lines.forEach((l, i) => {
    const m = /^([①-⑳]|\d{1,2})\s*([ァ-ヴー・]{2,12})(.*)$/.exec(l);
    if (!m) return;
    const number = /\d/.test(m[1]) ? Number(m[1]) : m[1].charCodeAt(0) - 0x2460 + 1;
    const rest = m[3];
    const w = /(\d{3})\s*[(（]\s*([+\-－−±]?\d{1,2})\s*[)）]/.exec(rest);
    const odds = /(?:^|\s)(\d{1,4}\.\d)(?:\s|$)/.exec(rest.replace(w?.[0] ?? "", " "));
    const grade = /^[A-ESＡ-Ｅ◎○▲△☆×]$/.test(lines[i - 1] ?? "") ? toHalfLetter(lines[i - 1]) : undefined;
    const next = lines[i + 1] ?? "";
    const comment = next && !/^([①-⑳]|\d{1,2})\s*[ァ-ヴー]/.test(next) && !/^[A-ESＡ-Ｅ◎○▲△☆×]$/.test(next)
      ? next.split("\t")[0].replace(/[－-]\s*$/, "").trim()
      : "";
    out.push({
      number,
      name: m[2],
      ...(grade ? { grade } : {}),
      ...(comment ? { comment } : {}),
      ...(w ? { weight: Number(w[1]), weightDiff: Number(w[2].replace(/[－−]/, "-").replace("±", "")) } : {}),
      ...(odds ? { odds: Number(odds[1]) } : {}),
    });
  });
  return out;
}

const toHalfLetter = (s: string) => s.replace(/[Ａ-Ｅ]/, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

// 評価の印・記号ごとの点
const GRADE_SCORE: Record<string, number> = { S: 1.5, A: 1, "◎": 1, B: 0.5, "○": 0.5, "▲": 0.3, C: 0, "△": 0, "☆": 0.3, D: -0.5, E: -1, "×": -1 };

const GOOD: [RegExp, string][] = [
  [/毛(ヅヤ|づや|艶)[^。、]{0,3}(良|いい|ピカピカ)|良化|上昇/, "上昇気配"],
  [/仕上が|好仕上|好気配|充実|張り|ハリ/, "仕上がり良"],
  [/気合|活気|ハツラツ|踏み込み|軽快|元気/, "気合十分"],
  [/いい傾向|好材料|落ち着/, "好材料"],
];
const BAD: [RegExp, string][] = [
  [/イレ込|入れ込|テンション|気負|チャカ|うるさ|二人引/, "イレ込み"],
  [/発汗|汗/, "発汗"],
  [/太め|重め|余裕残し|緩さ|ゆるさ/, "太め"],
  [/(細|寂し|ガレ|細化)(?![^。、]{0,4}体形)/, "細め"],
  [/覇気|硬さ|固さ|元気がな|物足り|地味/, "気配一息"],
];

/** パドック評価1頭分を点にする (プラスほど良い)。評価の印に、短評の良い・悪い言葉を足す */
export function readPaddock(p: Paddock): { score: number; hot: boolean; tags: string[] } {
  const tags: string[] = [];
  let score = p.grade !== undefined ? (GRADE_SCORE[p.grade] ?? 0) : 0;
  if (p.grade) tags.push(`評価${p.grade}`);
  const c = p.comment ?? "";
  for (const [re, tag] of GOOD)
    if (re.test(c)) {
      score += 0.3;
      tags.push(tag);
    }
  let hot = false;
  for (const [re, tag] of BAD)
    if (re.test(c)) {
      score -= 0.6; // 悪い気配の方が当たりやすいので重く
      tags.push(tag);
      if (tag === "イレ込み") hot = true;
    }
  if (p.weightDiff !== undefined && Math.abs(p.weightDiff) >= 12) {
    score -= 0.3;
    tags.push(`馬体重${p.weightDiff > 0 ? "+" : ""}${p.weightDiff}`);
  }
  return { score, hot, tags };
}

/**
 * 結論に使うパドックの点。貼り付けに載っていない馬は、載っている馬より下 (評価Cと同じ 0 点) とみなす
 * (パドック評価は良く見えた馬だけを挙げることが多いため)。誰も載っていなければ undefined。
 */
export function paddockScores(horses: Horse[]): (number | undefined)[] {
  if (!horses.some((h) => h.paddock)) return horses.map(() => undefined);
  return horses.map((h) => (h.paddock ? readPaddock(h.paddock).score : 0));
}
