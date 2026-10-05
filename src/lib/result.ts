import { normalize } from "./notation";
import type { Horse, Placement } from "./types";

/** 区切り記号ごとの間隔 (馬身)。JRA の表記では "," は1馬身未満、"-" は1〜5馬身、"=" は5馬身以上 */
const GAP: Record<string, number> = { ",": 1, "-": 2.5, "=": 6 };

/**
 * コーナー通過順の表記を隊列に変換する。
 *   例: "(*3,8)1-6,12(4,10)=5"  ( ) は横並び (内から順)、* は先頭争い
 */
export function parseCornerNotation(notation: string, horses: Horse[]): Placement[] {
  const s = normalize(notation).replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/[、]/g, ",").replace(/\*/g, "");
  const out: Placement[] = [];
  let x = 0;
  let lane = 0;
  let inGroup = false;
  let pendingGap = 0;
  let started = false;
  for (const m of s.matchAll(/\d+|[(),\-=]/g)) {
    const t = m[0];
    if (t === "(") {
      if (started) x += pendingGap || 1;
      pendingGap = 0;
      inGroup = true;
      lane = 0;
    } else if (t === ")") {
      inGroup = false;
      pendingGap = 0;
    } else if (t in GAP) {
      if (!inGroup) pendingGap = Math.max(pendingGap, GAP[t]);
    } else {
      const number = Number(t);
      const h = horses.find((x) => x.number === number);
      if (!h) continue;
      // ( ) の中は同じ位置に横並び。外では区切り記号の分だけ後ろへ
      if (!inGroup && started) x += pendingGap || 1;
      out.push({ number, frame: h.frame, name: h.name, x, lane: inGroup ? lane++ : 0 });
      started = true;
      pendingGap = 0;
    }
  }
  return out;
}

/**
 * 結果ページのテキストからコーナー通過順を取り出す。
 * "1コーナー (3,8)1-6..." "4角 3,8(1,6)..." のような行を探し、最初と最後のコーナーを返す。
 */
export function extractCorners(text: string): { firstCorner?: string; finalCorner?: string } {
  const s = normalize(text);
  const found: { corner: number; notation: string }[] = [];
  for (const m of s.matchAll(/([1-4])\s*(?:コーナー|角|C)\s*[:：]?\s*([0-9,\-=()（）、*\t ]+)/g)) {
    const notation = m[2].trim();
    if (/\d/.test(notation)) found.push({ corner: Number(m[1]), notation });
  }
  if (found.length === 0) return {};
  found.sort((a, b) => a.corner - b.corner);
  return { firstCorner: found[0].notation, finalCorner: found[found.length - 1].notation };
}

export interface ComparisonRow {
  number: number;
  name: string;
  predicted: number; // 予想の順位
  actual: number; // 実際の順位
  diff: number; // 実際 - 予想 (プラスなら予想より後ろだった)
}

/** 予想と実際の隊列を順位で比べる */
export function compare(predicted: Placement[], actual: Placement[]) {
  const rank = (list: Placement[]) => {
    const sorted = [...list].sort((a, b) => a.x - b.x || a.lane - b.lane);
    return new Map(sorted.map((p, i) => [p.number, i + 1]));
  };
  const pr = rank(predicted);
  const ar = rank(actual);
  const rows: ComparisonRow[] = actual
    .filter((p) => pr.has(p.number))
    .map((p) => ({
      number: p.number,
      name: p.name,
      predicted: pr.get(p.number)!,
      actual: ar.get(p.number)!,
      diff: ar.get(p.number)! - pr.get(p.number)!,
    }))
    .sort((a, b) => a.actual - b.actual);
  const meanAbs = rows.length > 0 ? rows.reduce((s, r) => s + Math.abs(r.diff), 0) / rows.length : 0;
  return { rows, meanAbs };
}
