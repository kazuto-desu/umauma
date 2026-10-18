import type { PastRace } from "./types";

/**
 * レースのクラスを中央・地方共通のおおまかな物差しにする (大きいほど上のクラス)。
 *   地方: 2歳新馬・未受賞 0 / 2歳戦 1 / C3 1 … C1 3 / B3 4 … B1 6 / A2 7 / A1 8 / OP・重賞 9〜10
 *   中央: 新馬・未勝利 4 / 1勝 6 / 2勝 8 / 3勝 9 / OP・L 10 / G3 11 / G2 12 / G1 13 (Jpn も同じ)
 * 中央と地方の対応は目安。同じレースに出る馬どうしの比較に使う。
 */
export function classOf(text: string, venue?: string): { name: string; level: number } | undefined {
  const s = text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/Ⅰ/g, "1")
    .replace(/Ⅱ/g, "2")
    .replace(/Ⅲ/g, "3");
  const jra = JRA_VENUE_RE.test(s) || JRA_VENUE_RE.test(venue ?? "");
  for (const [k, [re, name, level]] of RULES.entries()) {
    // 重賞・OP より下は、名古屋・笠松の組分け (C8組・3歳6組 など) を先に見る
    if (k === TOP_RULES) {
      const tokai = tokaiClassOf(s, TOKAI_RE.test(`${venue ?? ""}${s}`));
      if (tokai) return tokai;
    }
    const m = re.exec(s);
    if (!m) continue;
    if (name === "新馬" || name === "未勝利") return { name, level: jra ? 4 : 0 };
    if (name === "地方") return { name: m[0], level: NAR_LEVEL[m[1] + m[2]] };
    return { name, level };
  }
  return undefined;
}

const TOKAI_RE = /名古屋|笠松/;
// RULES のうち、重賞・オープン (組分けより上) の数
const TOP_RULES = 10;

/**
 * 名古屋・笠松のクラス。クラスの中を組の番号で分け、番号が小さいほど上。
 *   A1組 8 → A4組 6.5 / B1組 6 → B7組 4 / C1組 3 → C19組 0.8 くらい / 3歳1組 3 → 3歳18組 0.5
 * 組の番号が4以上 (C8組 など) なら、競馬場が分からなくても組分けとみなす (南関の C1〜C3 と取り違えないように)。
 */
function tokaiClassOf(s: string, tokai: boolean): { name: string; level: number } | undefined {
  const group = /(?<![A-Za-z])([ABC])(\d{1,2})組/.exec(s) ?? (tokai ? /(?<![A-Za-z])([ABC])(\d{1,2})(?!\d)/.exec(s) : null);
  if (group && (tokai || Number(group[2]) >= 4)) {
    const n = Number(group[2]);
    const level =
      group[1] === "A" ? Math.max(6.5, 8 - (n - 1) * 0.5) : group[1] === "B" ? Math.max(4, 6 - (n - 1) * 0.3) : Math.max(0.8, 3 - (n - 1) * 0.12);
    return { name: `${group[1]}${n}組`, level: Math.round(level * 100) / 100 };
  }
  if (!tokai) return undefined;
  const young = /([23])歳(\d{1,2})(?:組)?(?!\d)/.exec(s);
  if (young) {
    const n = Number(young[2]);
    const top = young[1] === "3" ? 3 : 1.5;
    return { name: `${young[1]}歳${n}組`, level: Math.round(Math.max(0.5, top - (n - 1) * 0.15) * 100) / 100 };
  }
  // 「〇〇特別C」のように、クラスの文字だけが付いたレース
  const letter = /([ABC])$/.exec(s.trim());
  if (letter) return { name: letter[1], level: { A: 7, B: 5, C: 2 }[letter[1] as "A" | "B" | "C"] };
  if (/3歳/.test(s)) return { name: "3歳", level: 2 };
  return undefined;
}

const JRA_VENUE_RE = /(東京|中山|京都|阪神|中京|新潟|福島|小倉|札幌|函館)/;
const NAR_LEVEL: Record<string, number> = {
  A1: 8, A2: 7, A3: 6.5, B1: 6, B2: 5, B3: 4, C1: 3, C2: 2, C3: 1,
};
// 上のクラスから順に調べる
const RULES: [RegExp, string, number][] = [
  [/(G|Jpn)1(?!\d)/, "G1", 13],
  [/(G|Jpn)2(?!\d)/, "G2", 12],
  [/(G|Jpn)3(?!\d)/, "G3", 11],
  [/(?<![A-Za-z])S1(?!\d)/, "S1", 10],
  [/(?<![A-Za-z])S2(?!\d)/, "S2", 9.5],
  [/(?<![A-Za-z])S3(?!\d)/, "S3", 9],
  [/SP1(?!\d)/, "SP1", 10], // 名古屋・笠松の重賞
  [/SP2(?!\d)/, "SP2", 9.5],
  [/SP3(?!\d)/, "SP3", 9],
  [/\(L\)|リステッド|OP|オープン|重賞/, "OP", 9.5],
  [/3勝|1600万/, "3勝", 9],
  [/2勝|1000万/, "2勝", 8],
  [/1勝|500万/, "1勝", 6],
  [/(?<![A-Za-z])([ABC])([1-3])(?=[\d一二三四五六七八九十()（）\s,、組選特]|$)/, "地方", 0],
  [/未勝利/, "未勝利", 0],
  [/新馬|未受賞/, "新馬", 0],
  [/2歳|ポイ|選定|特選|ジュニア/, "2歳", 1],
];

// 着差 (馬身などの書き方) → 秒のおおよそ
const MARGIN_WORDS: Record<string, number> = { 同着: 0, ハナ: 0.02, アタマ: 0.05, クビ: 0.07, 大差: 3 };

/** 着差を秒にする。"0.2" (秒) "クビ" "1.1/2" "1 1/2" "3/4" "大差" など。1馬身 ≒ 0.17秒 */
export function marginSeconds(text: string): number | undefined {
  const t = text.trim();
  if (t in MARGIN_WORDS) return MARGIN_WORDS[t];
  const lengths = /^(?:(\d{1,2})[.\s])?(\d)\/(\d)$/.exec(t);
  if (lengths) return Math.round((Number(lengths[1] ?? 0) + Number(lengths[2]) / Number(lengths[3])) * 0.17 * 100) / 100;
  if (/^\d{1,2}$/.test(t)) return Math.round(Number(t) * 0.17 * 100) / 100;
  if (/^-?\d{1,2}\.\d$/.test(t)) return Math.abs(Number(t));
  return undefined;
}

// クラスが1つ違うと、着順・着差の評価をこれだけずらす (0〜1 の物差しで)
const CLASS_STEP = 0.12;

/**
 * 近走の成績 (小さいほど良い。0 = 毎回勝っている、1 = 毎回大敗)。近3走それぞれ
 *   「着順 / 頭数」と「勝ち馬とのタイム差 (3秒以上は同じ扱い)」の平均
 * を出し、今回のメンバーの標準 (refClass) より上のクラスで走ったレースは良く、下のクラスは悪く見直す。
 * 新しいレースほど重く平均する。着順の分からない馬は undefined。
 */
export function formOf(races: PastRace[], refClass?: number): number | undefined {
  const done = races.filter((r) => r.finish && r.fieldSize && r.fieldSize > 1).slice(0, 3);
  if (done.length === 0) return undefined;
  const weights = [1, 0.7, 0.5];
  let sum = 0;
  let total = 0;
  done.forEach((r, k) => {
    const rank = Math.min(1, (r.finish! - 1) / (r.fieldSize! - 1));
    const gap = r.margin !== undefined ? Math.min(r.margin, 3) / 3 : rank;
    const classShift = r.classLevel !== undefined && refClass !== undefined ? CLASS_STEP * (r.classLevel - refClass) : 0;
    sum += weights[k] * ((rank + gap) / 2 - classShift);
    total += weights[k];
  });
  return sum / total;
}

/** 出走馬の前走のクラスの真ん中 (今回のレースのクラスの目安) */
export function fieldClass(horses: { pastRaces: PastRace[] }[]): number | undefined {
  const levels = horses
    .map((h) => h.pastRaces.find((r) => r.classLevel !== undefined)?.classLevel)
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);
  if (levels.length === 0) return undefined;
  const mid = Math.floor(levels.length / 2);
  return levels.length % 2 ? levels[mid] : (levels[mid - 1] + levels[mid]) / 2;
}
