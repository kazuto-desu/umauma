import { normalize } from "./notation";
import type { Workout } from "./types";

// "5F" のようなハロン表記付きでも、数字だけでも拾う
const TIME_RE = /(?:(\d)\s*[FＦ]\s*)?(\d{2,3}\.\d)/g;
// タイムとタイムの間に挟まってよい文字 (区切り記号・空白・位置取りの丸数字など)
const GAP_OK = /^[\s\-|｜/・①-⑳]*$/;
const DATE_RE = /(\d{1,2})[/.月](\d{1,2})日?/g;
const INTENSITY_RE = /(馬なり余力|馬なり|末強め|直強め|強め|追って一杯|稍一杯|叩き一杯|一杯|G前仕掛|仕掛け?)/;
// 併せ馬の行: "ボンセレンシス（Ｃ１）馬なりの内同入" など
const PARTNER_RE = /(同入|先着|遅れ|追走|併せ)/;

/**
 * 調教欄を貼り付けたテキストから追い切りを取り出す。
 * 1本の追い切りは、ゴールからの累計タイムが長い順に並んだもの
 * (例: "5F 66.5 51.8 38.6 12.9"、地方の調教場のように 3F までのもの "66.7 52.0 39.1")。
 */
export function parseWorkouts(text: string): Workout[] {
  const s = normalize(text);
  const matches = [...s.matchAll(TIME_RE)];
  const groups: RegExpMatchArray[][] = [];
  let i = 0;
  while (i < matches.length) {
    // 隙間に余計な文字がなく、値が減っていく限り同じ追い切りとみなす
    let j = i;
    while (
      j + 1 < matches.length &&
      GAP_OK.test(s.slice(end(matches[j]), matches[j + 1].index)) &&
      Number(matches[j + 1][2]) < Number(matches[j][2])
    )
      j++;
    const group = matches.slice(i, j + 1);
    const furlongs = inferFurlongs(group);
    if (group.length >= 2 && furlongs) groups.push(group);
    i = j + 1;
  }

  return groups.map((group, g) => {
    const first = group[0];
    const last = group[group.length - 1];
    const before = s.slice(g > 0 ? end(groups[g - 1].at(-1)!) : 0, first.index);
    const lineEnd = s.indexOf("\n", end(last));
    const sameLine = s.slice(end(last), lineEnd < 0 ? undefined : lineEnd);
    // 次の追い切りまでの行のうち、併せ馬の記述を拾う (日付のある行は次の追い切りのもの)
    const rest = s.slice(end(last), groups[g + 1]?.[0].index ?? s.length);
    const partner = rest
      .split("\n")
      .map((l) => l.trim())
      // 日付 ("10/9") のある行は次の追い切りの見出し。"0.2秒先着" の小数は日付ではない
      .find((l) => PARTNER_RE.test(l) && !/\d{1,2}[/月]\d{1,2}/.test(l));
    const header = lastLine(before);
    const furlongs = inferFurlongs(group)!;
    return {
      ...contextOf(header),
      intensity: INTENSITY_RE.exec(sameLine)?.[1] ?? INTENSITY_RE.exec(header)?.[1],
      ...(/前回/.test(header) ? { beforeLastRace: true } : {}),
      ...(partner ? { partner } : {}),
      marks: group.map((m, k) => ({ furlong: furlongs[k], time: Number(m[2]) })),
    };
  });
}

function end(m: RegExpMatchArray) {
  return (m.index ?? 0) + m[0].length;
}

/** 空行を除いた最後の行 */
function lastLine(text: string): string {
  return (
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .pop() ?? ""
  );
}

/**
 * 各タイムが何ハロンからの時計かを決める。表記があればそれを使う。なければ最後の時計で判断する:
 *   10.5〜17秒 → 1F (その前は「1Fの2.5倍未満なら2F、それ以上なら3F」)
 *   22〜30秒 → 2F、33〜48秒 → 3F
 * さらに前は1Fずつ増やす。どれにも当たらなければ追い切りではないとみなす。
 */
function inferFurlongs(group: RegExpMatchArray[]): number[] | undefined {
  const labels = group.map((m) => (m[1] ? Number(m[1]) : undefined));
  if (labels.every((l) => l !== undefined)) return labels as number[];
  const times = group.map((m) => Number(m[2]));
  const n = times.length;
  const lastTime = times[n - 1];
  const out = new Array<number>(n);
  let from: number;
  if (lastTime >= 10.5 && lastTime <= 17) {
    out[n - 1] = 1;
    if (n >= 2) out[n - 2] = times[n - 2] < lastTime * 2.5 ? 2 : 3;
    from = n - 3;
  } else if (lastTime >= 22 && lastTime <= 30) {
    out[n - 1] = 2;
    from = n - 2;
  } else if (lastTime >= 33 && lastTime <= 48) {
    out[n - 1] = 3;
    from = n - 2;
  } else {
    return undefined;
  }
  for (let k = from; k >= 0; k--) out[k] = out[k + 1] + 1;
  // 1ハロンあたり 10〜20 秒に収まらないものは時計ではない
  const ok = out.every((f, k) => times[k] / f >= 10 && times[k] / f <= 20);
  return ok ? out : undefined;
}

/** 追い切りの見出し行から日付・コース (馬場込み) を拾う。例: "(前回) 9/4 川崎調教場 良 一杯" */
function contextOf(header: string): Pick<Workout, "date" | "course"> {
  let date: string | undefined;
  for (const m of header.matchAll(DATE_RE)) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) date = `${mo}/${d}`;
  }
  const course = header
    .replace(DATE_RE, "")
    .replace(new RegExp(INTENSITY_RE.source, "g"), "")
    .replace(/前回/g, "")
    .replace(/[ァ-ヴー]{2,}/g, "") // 馬名 (カタカナ) は除く
    .replace(/[\d.()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
  return { date, course: course || undefined };
}

/** 区間ごとの1ハロン平均。span が 2 以上なら、まとめて計測された区間 */
export interface Segment {
  span: number; // 何ハロン分の区間か
  total: number; // 区間のタイム
  perFurlong: number; // 1ハロンあたり
}

/** 累計タイムを区間ごとのタイムに直す (スタート側から順)。最後の区間はゴールまで */
export function segmentsOf(w: Workout): Segment[] {
  const out: Segment[] = [];
  for (let k = 0; k < w.marks.length; k++) {
    const a = w.marks[k];
    const b = w.marks[k + 1] ?? { furlong: 0, time: 0 };
    const span = a.furlong - b.furlong;
    if (span <= 0) continue;
    const total = Math.round((a.time - b.time) * 10) / 10;
    out.push({ span, total, perFurlong: Math.round((total / span) * 10) / 10 });
  }
  return out;
}

export type LapShape = "加速" | "平行" | "失速";

/**
 * 終いの形。最後の区間 (1F または上がり3F の平均) を一つ前の区間と比べる。
 *   加速: 一つ前以下、かつ一つ前がそれより前の平均より速い (区間が2つだけなら 0.1秒以上速い)
 *   失速: 一つ前より 0.4秒以上遅い
 */
export function lapShape(w: Workout): LapShape | undefined {
  const seg = segmentsOf(w).map((s) => s.perFurlong);
  if (seg.length < 2) return undefined;
  const last = seg[seg.length - 1];
  const prev = seg[seg.length - 2];
  if (last > prev + 0.4) return "失速";
  if (seg.length === 2) return last <= prev - 0.1 ? "加速" : "平行";
  const earlier = seg.slice(0, -2).reduce((s, v) => s + v, 0) / (seg.length - 2);
  return last <= prev + 0.05 && prev < earlier ? "加速" : "平行";
}

/** 指定したハロンの時計 (例: 3 なら上がり3F) */
export function timeAt(w: Workout, furlong: number): number | undefined {
  return w.marks.find((m) => m.furlong === furlong)?.time;
}

/** 日付付きなら一番新しいもの、なければ最後のものを最終追い切りとする */
export function latestWorkout(list: Workout[] | undefined): Workout | undefined {
  if (!list || list.length === 0) return undefined;
  const key = (w: Workout) => {
    const [m, d] = (w.date ?? "").split("/").map(Number);
    return m ? m * 100 + d : -1;
  };
  return list.reduce((best, w) => (key(w) >= key(best) ? w : best));
}

/** 馬名の行にある短評と矢印 (例: "パミール 変わらず →") */
export function trainingCommentOf(segment: string, name: string): { comment?: string; trend?: string } {
  const line = normalize(segment).split("\n").find((l) => l.includes(name));
  if (!line) return {};
  const rest = line.slice(line.indexOf(name) + name.length);
  const trend = /[→↑↓↗↘]/.exec(rest)?.[0];
  const comment = rest.replace(/[→↑↓↗↘]/g, "").replace(/\s+/g, " ").trim();
  return { ...(comment ? { comment } : {}), ...(trend ? { trend } : {}) };
}

export interface LapScore {
  score: number; // 1ハロンあたりの秒に換算した評価値。小さいほど良い
  lastPerFurlong: number; // 終いの区間の1ハロン平均
  lastSpan: number; // 終いの区間が何ハロンか (1 or 3 など)
  accel: number; // 一つ前の区間より何秒速くなったか (マイナスは遅くなった)
  reasons: string[];
}

/**
 * 追い切りのラップの良さを1つの値にする (小さいほど良い)。
 *   終いの1ハロン平均
 *   − 加速分 × 0.5 (一つ前の区間より速くなった分。最大1秒まで評価)
 *   − 馬なりなら 0.15 / 一杯なら + 0.1 (余力を残して出した時計ほど価値がある)
 *   + 馬場補正 (ダートの重・不良は時計が出やすいので 0.1〜0.2 秒割り引く)
 */
export function scoreWorkout(w: Workout, courseOffset = 0): LapScore | undefined {
  const seg = segmentsOf(w);
  if (seg.length < 2) return undefined;
  const last = seg[seg.length - 1];
  const prev = seg[seg.length - 2];
  const accel = Math.round((prev.perFurlong - last.perFurlong) * 10) / 10;
  const accelBonus = Math.min(1, accel) * 0.5;
  const intensity = /馬なり/.test(w.intensity ?? "") ? -0.15 : /一杯/.test(w.intensity ?? "") ? 0.1 : 0;
  const going = /不/.test(w.course ?? "") ? 0.2 : /重/.test(w.course ?? "") ? 0.15 : /稍/.test(w.course ?? "") ? 0.05 : 0;
  const partner = w.partner ? partnerScore(parsePartner(w.partner), w.intensity) : undefined;
  // コースの平均より速いコースの時計は、その分を割り引く (courseOffset = コース平均 − 全体平均)
  const score =
    Math.round((last.perFurlong - accelBonus + intensity + going + (partner?.value ?? 0) - courseOffset) * 100) / 100;

  const reasons = [
    last.span > 1
      ? `終い${last.span}F ${last.total.toFixed(1)} (≒${last.perFurlong.toFixed(1)})`
      : `終い1F ${last.total.toFixed(1)}`,
    accel >= 0.1 ? `${accel.toFixed(1)}秒加速` : accel <= -0.1 ? `${(-accel).toFixed(1)}秒失速` : "平行",
  ];
  if (w.intensity) reasons.push(w.intensity);
  if (partner?.label) reasons.push(partner.label);
  if (going > 0) reasons.push("道悪の時計");
  if (Math.abs(courseOffset) >= 0.05)
    reasons.push(`コース補正${courseOffset < 0 ? "+" : "−"}${Math.abs(courseOffset).toFixed(1)}`);
  return { score, lastPerFurlong: last.perFurlong, lastSpan: last.span, accel, reasons };
}

export interface PartnerResult {
  result?: "先着" | "同入" | "遅れ";
  margin?: number; // 秒 (馬身は 1馬身 = 0.2秒 で換算)
  position?: "内" | "外"; // 自分が相手の内を回ったか外を回ったか
  partnerIntensity?: string; // 相手の追い方
  partnerClass?: string; // 相手のクラス (Ｃ１, 2歳 など)
}

/** 併せ馬の記述を読む。例: "○○（Ｃ1）馬なりの内同入" "○○（Ｂ3）強めの外0.3秒先着" "○○（2歳）一杯の内を4Ｆ付1馬身遅れ" */
export function parsePartner(text: string): PartnerResult {
  const t = normalize(text);
  const result = /先着/.test(t) ? "先着" : /遅れ/.test(t) ? "遅れ" : /同入/.test(t) ? "同入" : undefined;
  const sec = /(\d+\.\d)\s*秒?\s*(?:先着|遅れ)/.exec(t);
  const len = /(\d+(?:\.\d)?|[1-9]\/[2-4]|半|クビ|アタマ|ハナ)\s*馬身?\s*(?:先着|遅れ)/.exec(t);
  let margin: number | undefined;
  if (sec) margin = Number(sec[1]);
  else if (len) {
    const v = len[1];
    margin = v === "半" ? 0.1 : /クビ|アタマ|ハナ/.test(v) ? 0.05 : v.includes("/") ? 0.1 : Number(v) * 0.2;
  }
  const position = /の外/.test(t) ? "外" : /の内/.test(t) ? "内" : undefined;
  const partnerIntensity = INTENSITY_RE.exec(t.replace(/^[^）)]*[）)]/, ""))?.[1];
  const partnerClass = /[（(]([^）)]+)[）)]/.exec(t)?.[1];
  return { result, margin, position, partnerIntensity, partnerClass };
}

/**
 * 併せ馬の評価 (小さいほど良い、1ハロンあたりの秒)。
 *   先着 −0.15 (0.4秒以上の差なら −0.25)、遅れ +0.15 (0.4秒以上なら +0.25)、同入 0
 *   外を回っての同入・先着は −0.05 (内より距離を走っている)
 *   相手が2歳馬なら先着の評価は半分
 *   相手が馬なりで自分が一杯の同入は +0.05 (相手に余力があった)
 */
function partnerScore(p: PartnerResult, ownIntensity?: string): { value: number; label?: string } {
  if (!p.result) return { value: 0 };
  let value = 0;
  if (p.result === "先着") value = (p.margin ?? 0) >= 0.4 ? -0.25 : -0.15;
  if (p.result === "遅れ") value = (p.margin ?? 0) >= 0.4 ? 0.25 : 0.15;
  if (p.result !== "遅れ" && p.position === "外") value -= 0.05;
  if (p.result === "先着" && /2歳/.test(p.partnerClass ?? "")) value /= 2;
  if (p.result === "同入" && /馬なり/.test(p.partnerIntensity ?? "") && /一杯/.test(ownIntensity ?? "")) value += 0.05;
  const margin = p.margin !== undefined ? `${p.margin.toFixed(1)}秒` : "";
  const label = `併せ${p.position === "外" ? "外" : ""}${margin}${p.result}`;
  return { value: Math.round(value * 100) / 100, label };
}

/** コース名から馬場状態を除いたもの (例: "川崎調教場 良" → "川崎調教場") */
export function courseKey(course: string | undefined): string | undefined {
  const key = course?.replace(/\s*(良|稍重|稍|重|不良|不)$/, "").trim();
  return key || undefined;
}

/** コースごとの時計を貯めておくための1件分 (終いの1ハロン平均) */
export interface CourseSample {
  course: string;
  perFurlong: number;
}

/** 同じ追い切りを二重に数えないためのキー */
export function sampleKey(horseName: string, w: Workout): string {
  return [horseName, w.date ?? "", courseKey(w.course) ?? "", w.marks.map((m) => m.time).join("-")].join("|");
}

export function sampleOf(w: Workout): CourseSample | undefined {
  const course = courseKey(w.course);
  const seg = segmentsOf(w);
  if (!course || seg.length === 0) return undefined;
  return { course, perFurlong: seg[seg.length - 1].perFurlong };
}

/** 補正に使うのに必要な、1コースあたりの追い切りの本数 */
export const MIN_COURSE_SAMPLES = 20;

export interface CourseBaseline {
  course: string;
  count: number;
  mean: number;
  offset: number; // コース平均 − 全体平均 (マイナスなら時計の出やすいコース)。本数不足なら 0
}

/**
 * 貯めた時計からコースごとの平均を出す。全体平均は「本数が足りているコース」だけで計算し、
 * 本数が足りないコースは補正しない (offset 0)。
 */
export function courseBaselines(samples: CourseSample[]): CourseBaseline[] {
  const by = new Map<string, number[]>();
  for (const s of samples) by.set(s.course, [...(by.get(s.course) ?? []), s.perFurlong]);
  const stats = [...by].map(([course, v]) => ({ course, count: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length }));
  const enough = stats.filter((s) => s.count >= MIN_COURSE_SAMPLES);
  // 補正は比べる相手のコースがあって初めて意味がある
  const global = enough.length >= 2 ? enough.reduce((a, s) => a + s.mean * s.count, 0) / enough.reduce((a, s) => a + s.count, 0) : undefined;
  return stats
    .map((s) => ({
      ...s,
      mean: Math.round(s.mean * 100) / 100,
      offset: global !== undefined && s.count >= MIN_COURSE_SAMPLES ? Math.round((s.mean - global) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
