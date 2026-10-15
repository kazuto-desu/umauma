import { frameOf } from "./frame";
import { classOf } from "./form";
import type { Horse, PastRace } from "./types";

/**
 * 地方競馬の馬柱 (1項目1行で、3走前→前走の順に並ぶ形式) を読む。例:
 *   1 / 1 / 本田紀 / 54 / 0.0.0.3 / 54.9 / (父) / 牝2 / (馬名) / (母) …
 *   5川④ 7.30 新馬 6頭 / 6 / 900ダ1.02.1 / 本田紀 54 / H -40.3 / "　⑥ 6 6" (タブ区切り) / …
 * 「性齢」の行を目印に、次の行を馬名、前の方の行から馬番・枠・騎手を取る。
 * 能力試験は実戦ではないので過去走に含めない。
 */
export function parseNarCard(text: string): Horse[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => toHalf(l).replace(/\s+$/, ""));
  const trimmed = lines.map((l) => l.trim());

  const starts: { at: number; horse: Horse }[] = [];
  trimmed.forEach((l, i) => {
    if (!SEX_AGE_RE.test(l) || !NAME_RE.test(trimmed[i + 1] ?? "")) return;
    // 性齢の前: … 馬番 / 騎手 / 斤量 / 騎手成績 / 単勝 / 父名 / 性齢
    // 斤量の行: 直前が騎手名、その前が馬番 (単勝オッズ "54.9" と取り違えないように並びで確かめる)
    const w = findBack(i, 7, (k) =>
      WEIGHT_RE.test(trimmed[k]) && /^\D{2,6}$/.test(trimmed[k - 1] ?? "") && /^\d{1,2}$/.test(trimmed[k - 2] ?? ""),
    );
    if (w < 0) return;
    const jockey = trimmed[w - 1]?.replace(MARK_RE, "");
    const number = Number(trimmed[w - 2]);
    const frame = Number(trimmed[w - 3]);
    if (!(number >= 1 && number <= 18) || !jockey || /\d/.test(jockey)) return;
    // 血統: 性齢の前の行が父、馬名の次が母、毛色をはさんで母父
    const isCoat = (t: string | undefined) => !!t && /^(鹿|黒鹿|青鹿|青|栗|栃栗|芦|白|尾花栗|鹿毛|栗毛|芦毛|青毛)$/.test(t);
    const sire = trimmed[i - 1];
    const dam = isCoat(trimmed[i + 2]) ? undefined : trimmed[i + 2];
    const damsire = isCoat(trimmed[i + 3]) ? trimmed[i + 4] : undefined;
    const blood = {
      ...(sire && !/\d/.test(sire) ? { sire } : {}),
      ...(dam && !/\d/.test(dam) ? { dam } : {}),
      ...(damsire && !/\d/.test(damsire) ? { damsire } : {}),
    };
    // 斤量と父名の間に単勝オッズ (騎手成績 "0.0.0.3" の次の行)
    const oddsLine = trimmed.slice(w + 1, i - 1).find((t) => /^\d{1,4}\.\d$/.test(t));
    starts.push({
      at: w - 3,
      horse: {
        number,
        frame: frame >= 1 && frame <= 8 ? frame : 0,
        name: trimmed[i + 1],
        jockey,
        carried: Number(trimmed[w].replace(MARK_RE, "")),
        ...blood,
        ...(oddsLine ? { odds: Number(oddsLine) } : {}),
        pastRaces: [],
      },
    });
  });

  const fieldSize = starts.length;
  return starts.map(({ horse }, k) => {
    const from = starts[k].at;
    const to = starts[k + 1]?.at ?? lines.length;
    const races = readRaces(lines.slice(from, to), trimmed.slice(from, to));
    return {
      ...horse,
      frame: horse.frame || frameOf(horse.number, fieldSize),
      pastRaces: races.reverse(), // 3走前→前走 の並びを新しい順に
    };
  });
}

const SEX_AGE_RE = /^(牡|牝|セ|騸)\d{1,2}$/;
const NAME_RE = /^[ァ-ヴー・]{2,12}$/;
const WEIGHT_RE = /^[▲△☆★◇◆]?\d{2}(\.\d)?$/;
const MARK_RE = /^[▲△☆★◇◆]/;
// "5川④ 7.30 新馬 6頭" "川 8.21 能力試験 4頭" "7川1 9.7 選定馬, 10頭"
const HEADER_RE = /^\d*([^\d\s①-⑳]{1,2})[\d①-⑳]*\s+(\d{1,2})\.(\d{1,2})\s+(.*?)\s*(\d{1,2})頭$/;
const COURSE_RE = /^(\d{3,4})(ダ|芝)/;
// 勝ち馬 (2着馬)・タイム差・馬体重: "ジョリージャ 6.7 396"
const WINNER_RE = /^\S+\s+(\d{1,2}\.\d)\s+\d{3}$/;
// ペース・前半3F・上がり3F: "H 43.3-48.8" "S 41.2-46.7" "H -40.3" (短い距離は前半3Fなし)
const PACE_RE = /^([HMS])?\s*(\d{2}\.\d)?\s*-\s*(\d{2}\.\d)/;

const VENUES: Record<string, string> = {
  帯: "帯広", 門: "門別", 盛: "盛岡", 水: "水沢", 浦: "浦和", 船: "船橋", 大: "大井", 川: "川崎",
  金: "金沢", 笠: "笠松", 名: "名古屋", 園: "園田", 姫: "姫路", 高: "高知", 佐: "佐賀",
};

function readRaces(raw: string[], lines: string[]): PastRace[] {
  const races: PastRace[] = [];
  lines.forEach((l, i) => {
    const h = HEADER_RE.exec(l);
    if (!h || /能力試験|能検/.test(h[4])) return;
    const finish = Number(lines[i + 1]);
    if (!(finish >= 1)) return; // 除外・取消・中止
    const fieldSize = Number(h[5]);
    const race: PastRace = {
      date: `${h[2]}/${h[3]}`,
      ...(VENUES[h[1]] ? { venue: VENUES[h[1]] } : {}),
      fieldSize,
      finish,
      passing: [],
    };
    const cls = classOf(h[4]);
    if (cls) {
      race.className = h[4].replace(/[,、\s]+$/, "") || cls.name;
      race.classLevel = cls.level;
    }
    // 次のレースの見出しまでの数行から、コース・上がり・通過順を探す
    for (let j = i + 2; j < Math.min(lines.length, i + 9) && !HEADER_RE.test(lines[j]); j++) {
      const c = COURSE_RE.exec(lines[j]);
      if (c) {
        race.surface = c[2] as PastRace["surface"];
        race.distance = Number(c[1]);
        continue;
      }
      const p = PACE_RE.exec(lines[j]);
      if (p && race.passing.length === 0) {
        const last3f = Number(p[3]);
        if (last3f >= 30 && last3f <= 50) race.last3f = last3f;
        const first3f = p[2] ? Number(p[2]) : undefined;
        if (first3f && first3f >= 30 && first3f <= 50) race.first3f = first3f;
        if (p[1]) race.pace = p[1] as PastRace["pace"];
        continue;
      }
      const jw = /^(\D{2,6})\s+[▲△☆★◇◆]?(\d{2}(?:\.\d)?)$/.exec(lines[j]);
      if (jw && !race.jockey) {
        race.jockey = jw[1];
        race.carried = Number(jw[2]);
        continue;
      }
      const w = WINNER_RE.exec(lines[j]);
      if (w && race.passing.length > 0) {
        race.margin = finish === 1 ? 0 : Number(w[1]);
        continue;
      }
      if (raw[j].includes("\t")) {
        const passing = raw[j]
          .split("\t")
          .map((s) => s.trim())
          .filter(Boolean)
          .map(Number);
        if (passing.length >= 2 && passing.every((n) => n >= 1 && n <= fieldSize)) race.passing = passing;
      }
    }
    if (race.passing.length > 0) races.push(race);
  });
  return races;
}

function findBack(from: number, max: number, test: (k: number) => boolean) {
  for (let i = from - 1; i >= Math.max(0, from - max); i--) if (test(i)) return i;
  return -1;
}

/** 全角数字・丸数字を半角数字に、全角スペースを半角に */
function toHalf(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[①-⑳]/g, (c) => String(c.charCodeAt(0) - 0x2460 + 1))
    .replace(/　/g, " ");
}
