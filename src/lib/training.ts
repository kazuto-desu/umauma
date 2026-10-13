import { normalize } from "./notation";
import type { Workout } from "./types";

// "5F" のようなハロン表記付きでも、数字だけでも拾う
const TIME_RE = /(?:(\d)\s*[FＦ]\s*)?(\d{2,3}\.\d)/g;
// タイムとタイムの間に挟まってよい文字 (区切り記号・空白・位置取りの丸数字など)
const GAP_OK = /^[\s\-|｜/・①-⑳]*$/;
const DATE_RE = /(\d{1,2})[/.月](\d{1,2})日?/g;
const INTENSITY_RE = /(馬なり余力|馬なり|強め|一杯|末強め|直強め|G前仕掛|仕掛け?|追って一杯|稍一杯|叩き一杯)/;

/**
 * 調教欄を貼り付けたテキストから追い切りを取り出す。
 * 1本の追い切りは、ゴールからの累計タイムが長い順に並んだもの (例: "5F 66.5 51.8 38.6 12.9")。
 */
export function parseWorkouts(text: string): Workout[] {
  const s = normalize(text);
  const matches = [...s.matchAll(TIME_RE)];
  const workouts: Workout[] = [];
  let i = 0;
  let prevEnd = 0;
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
    const times = group.map((m) => Number(m[2]));
    const last = times[times.length - 1];
    if (times.length >= 2 && last >= 10.5 && last <= 17) {
      const furlongs = inferFurlongs(group.map((m) => (m[1] ? Number(m[1]) : undefined)), times);
      const before = s.slice(prevEnd, group[0].index);
      const lineEnd = s.indexOf("\n", end(group[group.length - 1]));
      const after = s.slice(end(group[group.length - 1]), lineEnd < 0 ? undefined : lineEnd);
      workouts.push({
        ...contextOf(before),
        intensity: INTENSITY_RE.exec(after)?.[1] ?? INTENSITY_RE.exec(before)?.[1],
        marks: times.map((t, k) => ({ furlong: furlongs[k], time: t })),
      });
      prevEnd = end(group[group.length - 1]);
    }
    i = j + 1;
  }
  return workouts;
}

function end(m: RegExpMatchArray) {
  return (m.index ?? 0) + m[0].length;
}

/**
 * 各タイムが何ハロンからの時計かを決める。表記があればそれを使い、なければ
 * 最後を1F、その前は「1Fの2.5倍未満なら2F、それ以上なら3F」、さらに前は1Fずつ増やす。
 */
function inferFurlongs(labels: (number | undefined)[], times: number[]): number[] {
  if (labels.every((l) => l !== undefined)) return labels as number[];
  const n = times.length;
  const out = new Array<number>(n);
  out[n - 1] = 1;
  if (n >= 2) out[n - 2] = times[n - 2] < times[n - 1] * 2.5 ? 2 : 3;
  for (let k = n - 3; k >= 0; k--) out[k] = out[k + 1] + 1;
  return out;
}

/** 直前のテキストから日付・コース・馬場を拾う */
function contextOf(before: string): Pick<Workout, "date" | "course"> {
  let date: string | undefined;
  for (const m of before.matchAll(DATE_RE)) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) date = `${mo}/${d}`;
  }
  // 最後の行の、日付と数字を除いた部分をコース名として扱う (例: "大井外 良")
  const line = before.trim().split("\n").pop() ?? "";
  const course = line
    .replace(DATE_RE, "")
    .replace(new RegExp(INTENSITY_RE.source, "g"), "")
    .replace(/[ァ-ヴー]{2,}/g, "") // 馬名 (カタカナ) は除く
    .replace(/[\d.()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
  return { date, course: course || undefined };
}

export interface Lap {
  time: number; // 1ハロンあたりの秒
  estimated: boolean; // 2F以上まとめて計測された区間を均等割りしたもの
}

/** 累計タイムから1ハロンごとのラップに直す (スタート側から順) */
export function lapsOf(w: Workout): Lap[] {
  const laps: Lap[] = [];
  for (let k = 0; k < w.marks.length; k++) {
    const a = w.marks[k];
    const b = w.marks[k + 1] ?? { furlong: 0, time: 0 };
    const span = a.furlong - b.furlong;
    if (span <= 0) continue;
    const lap = Math.round(((a.time - b.time) / span) * 10) / 10;
    for (let f = 0; f < span; f++) laps.push({ time: lap, estimated: span > 1 });
  }
  return laps;
}

export type LapShape = "加速" | "平行" | "失速";

/** 終いの形: 最後の2ハロンが前より速くなっていれば加速 */
export function lapShape(laps: Lap[]): LapShape | undefined {
  if (laps.length < 3) return undefined;
  const last = laps[laps.length - 1].time;
  const prev = laps[laps.length - 2].time;
  const before = laps.slice(0, -2).reduce((s, l) => s + l.time, 0) / (laps.length - 2);
  if (last <= prev && prev < before) return "加速";
  if (last > prev + 0.4) return "失速";
  return "平行";
}

/** 日付付きなら一番新しいもの、なければ最初のものを最終追い切りとする */
export function latestWorkout(list: Workout[] | undefined): Workout | undefined {
  if (!list || list.length === 0) return undefined;
  const key = (w: Workout) => {
    const [m, d] = (w.date ?? "").split("/").map(Number);
    return m ? m * 100 + d : -1;
  };
  return [...list].sort((a, b) => key(b) - key(a))[0];
}
