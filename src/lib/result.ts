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

export interface ResultTableRow {
  finish?: number; // 着順 (取消・中止などは undefined)
  number: number; // 馬番
  name: string;
  passing: number[]; // コーナー通過順
  stopped?: boolean; // 途中で競走中止 (passing は止まるまでの分だけ)
}

/**
 * 地方競馬などの結果表 (1頭1行) を読む。
 *   "1  1  1  エストレーラヘーザ  川崎  牝 3  52.0  ...  1-1-1  7  22.7"
 * 行頭が「着順 枠 馬番 馬名」の並びで、行の中の "1-1-1" をコーナー通過順とする。
 */
export function parseResultTable(text: string): ResultTableRow[] {
  const rows = parseResultRows(text);
  return rows.length >= 2 ? rows : parseResultBlocks(text);
}

function parseResultRows(text: string): ResultTableRow[] {
  const rows: ResultTableRow[] = [];
  for (const raw of normalize(text).split("\n")) {
    const m = /^\s*(\d{1,2}|中止|除外|取消|失格)\s+(\d)\s+(\d{1,2})\s+([^\s\d①-⑳]{2,})/.exec(raw);
    if (!m) continue;
    const rest = raw.slice(m.index + m[0].length);
    const passing = /(?:^|\s)(\d{1,2}(?:-\d{1,2}){1,3})(?=\s|$)/.exec(rest)?.[1];
    rows.push({
      finish: /^\d+$/.test(m[1]) ? Number(m[1]) : undefined,
      number: Number(m[3]),
      name: m[4],
      passing: passing ? passing.split("-").map(Number) : [],
    });
  }
  return rows;
}

/** 各馬の位置 (同じ位置は横並び) を通過順の表記にする。例: {1:1, 4:1, 9:1, 8:4} → "(1,4,9),8" */
export function notationFromPositions(positions: { number: number; pos: number }[]): string {
  const byPos = new Map<number, number[]>();
  for (const p of positions) byPos.set(p.pos, [...(byPos.get(p.pos) ?? []), p.number]);
  return [...byPos]
    .sort((a, b) => a[0] - b[0])
    .map(([, nums]) => (nums.length > 1 ? `(${nums.sort((a, b) => a - b).join(",")})` : String(nums[0])))
    .join(",")
    .replace(/,\(/g, "(")
    .replace(/\),/g, ")");
}

/** 結果表から最初・最後のコーナーの表記と着順を作る */
export function resultFromTable(rows: ResultTableRow[]): { firstCorner: string; finalCorner: string; finish: string } | undefined {
  const withPassing = rows.filter((r) => r.passing.length > 0);
  if (withPassing.length < 2) return undefined;
  // 競走中止の馬は最後のコーナーまで回っていないので、最終コーナーには入れない
  const at = (pick: (p: number[]) => number, list = withPassing) =>
    notationFromPositions(list.map((r) => ({ number: r.number, pos: pick(r.passing) })));
  const finish = rows
    .filter((r) => r.finish !== undefined)
    .sort((a, b) => a.finish! - b.finish!)
    .map((r) => r.number)
    .join(",");
  return {
    firstCorner: at((p) => p[0]),
    finalCorner: at((p) => p[p.length - 1], withPassing.filter((r) => !r.stopped)),
    finish,
  };
}

// 丸数字 (①〜⑳) も位置として読む
const POS_RE = /^(\d{1,2}|[①-⑳])$/;
// 競走中止の印 ("落" = 落馬 など)。これより後ろは位置がない
const STOP_RE = /^(落|止|中|故|外|失)$/;
const posOf = (t: string) => (/\d/.test(t) ? Number(t) : t.charCodeAt(0) - 0x2460 + 1);

/**
 * 1頭が複数行に分かれた結果表を読む (netkeiba の地方の結果など)。
 *   "1  1"            ← 着順 馬番
 *   "エストレーラヘーザ" ← 馬名
 *   "牝3 加藤雄 52" …
 *   "  ⑦  9  6"        ← 通過順 (空白区切り、丸数字あり)
 */
const NAME_RE = /^[ァ-ヴー・]{2,12}$/;

function parseResultBlocks(text: string): ResultTableRow[] {
  const lines = normalize(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const rows: ResultTableRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^(\d{1,2}|中止|除外|取消|失格)\s+(\d{1,2})$/.exec(lines[i]);
    const name = lines[i + 1];
    if (!head || !name || !NAME_RE.test(name)) continue;
    const row: ResultTableRow = {
      finish: /^\d+$/.test(head[1]) ? Number(head[1]) : undefined,
      number: Number(head[2]),
      name,
      passing: [],
    };
    // 次の馬の見出しまでの間で、位置だけが2〜4個並んだ行を通過順とする
    for (let j = i + 2; j < lines.length; j++) {
      if (/^(\d{1,2}|中止|除外|取消|失格)\s+\d{1,2}$/.test(lines[j]) && NAME_RE.test(lines[j + 1] ?? "")) break;
      const tokens = lines[j].split(/\s+/);
      const stop = tokens.findIndex((t) => STOP_RE.test(t));
      const pos = stop < 0 ? tokens : tokens.slice(0, stop);
      if (
        tokens.length >= 2 &&
        tokens.length <= 4 &&
        pos.length >= 1 &&
        pos.every((t) => POS_RE.test(t)) &&
        tokens.slice(pos.length).every((t) => STOP_RE.test(t))
      ) {
        row.passing = pos.map(posOf);
        if (stop >= 0) row.stopped = true;
        break;
      }
    }
    rows.push(row);
    i += 1;
  }
  return rows;
}
