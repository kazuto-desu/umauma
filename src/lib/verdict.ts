import { predict } from "./predict";
import { latestWorkout, risingOf, scoreWorkout } from "./training";
import type { Horse, PastRace, PredictOptions, Prediction, Race, Workout } from "./types";

export type Mark = "◎" | "○" | "▲" | "△";
const MARKS: Mark[] = ["◎", "○", "▲", "△", "△"];

export interface VerdictRow {
  number: number;
  name: string;
  mark: Mark;
  reasons: string[];
}

/**
 * いろいろな材料を1つの順位にまとめて印を付ける。
 *   ゴール前の想定位置 (展開・ペース・コース・末脚・調子をすべて含む) … 重み 0.3
 *   近走の着順・勝ち馬とのタイム差 (出走馬の中での順位) … 0.2
 *   最終追い切りのラップの良さ (出走馬の中での順位) … 0.1
 *   調子の上昇度 (出走馬の中での順位) … 0.4
 * 材料がない馬は、その分を除いて重みを付け直す。
 */
export function verdict(
  prediction: Prediction,
  horses: Horse[],
  offsetOf: (w: Workout) => number = () => 0,
): VerdictRow[] {
  const runners = prediction.analyses.filter((a) => a.goal !== undefined);
  if (runners.length === 0) return [];
  const horseOf = (n: number) => horses.find((h) => h.number === n)!;

  // 0 (一番良い) 〜 1 (一番悪い) の順位にする。値が無い馬は undefined
  const pct = (values: (number | undefined)[], lowerIsBetter: boolean) => {
    const known = values.filter((v): v is number => v !== undefined).sort((a, b) => (lowerIsBetter ? a - b : b - a));
    // 同じ値の馬は順位の平均にする (横並びの馬がまとめて最上位扱いにならないように)
    const rank = (v: number) => (known.indexOf(v) + known.lastIndexOf(v)) / 2;
    return values.map((v) => (v === undefined || known.length < 2 ? undefined : rank(v) / (known.length - 1)));
  };
  // ゴール前の想定位置はもともと 0 (先頭) 〜 1 (最後方) なので、順位にせずそのまま使う
  // (展開がほぼ同じ馬どうしの小さな差を大きく扱わないように)
  const goal = runners.map((a) => Math.max(0, Math.min(1, a.goal!)));
  const lap = pct(
    runners.map((a) => {
      const w = latestWorkout(horseOf(a.number).workouts);
      return w ? scoreWorkout(w, offsetOf(w))?.score : undefined;
    }),
    true,
  );
  const risings = runners.map((a) => {
    const h = horseOf(a.number);
    return risingOf(h.workouts, h.trainingTrend, h.trainingComment);
  });
  const rise = pct(risings.map((r) => r?.score), false);
  const form = pct(runners.map((a) => formOf(horseOf(a.number).pastRaces)), true);

  const scored = runners.map((a, i) => {
    const parts = [
      { v: goal[i], w: 0.3 },
      { v: form[i], w: 0.2 },
      { v: lap[i], w: 0.1 },
      { v: rise[i], w: 0.4 },
    ].filter((p): p is { v: number; w: number } => p.v !== undefined);
    const total = parts.length ? parts.reduce((s, p) => s + p.v * p.w, 0) / parts.reduce((s, p) => s + p.w, 0) : 1;
    return { a, i, total };
  });
  scored.sort((x, y) => x.total - y.total || x.a.goal! - y.a.goal!);

  const goalRank = new Map([...runners].sort((x, y) => x.goal! - y.goal!).map((a, k) => [a.number, k + 1]));
  return scored.slice(0, MARKS.length).map(({ a, i }, k) => {
    const reasons = [`ゴール前${goalRank.get(a.number)}番手の想定`];
    if (a.advantage === "有利" || a.advantage === "やや有利") reasons.push(`展開${a.advantage}`);
    const last = horseOf(a.number).pastRaces.find((r) => r.finish);
    if (last?.finish && last.finish <= 3) reasons.push(`前走${last.finish}着`);
    else if (form[i] !== undefined && form[i]! <= 0.25) reasons.push("近走の成績上位");
    if (lap[i] !== undefined && lap[i]! <= 0.25) reasons.push("調教ラップ上位");
    if (rise[i] !== undefined && rise[i]! <= 0.25 && (risings[i]?.score ?? 0) > 0) reasons.push("調子上昇");
    if (a.closing === "S") reasons.push("末脚上位");
    if (a.condition && a.condition.value >= 0.25) reasons.push("調教で調子落ちに注意");
    return { number: a.number, name: a.name, mark: MARKS[k], reasons };
  });
}

/**
 * 近走の成績 (0 = 良い 〜 1 = 悪い)。近3走の「着順 / 頭数」と「勝ち馬とのタイム差 (3秒以上は同じ扱い)」を
 * 新しいレースほど重く平均する。着順の分からない馬は undefined。
 */
export function formOf(races: PastRace[]): number | undefined {
  const done = races.filter((r) => r.finish && r.fieldSize && r.fieldSize > 1).slice(0, 3);
  if (done.length === 0) return undefined;
  const weights = [1, 0.7, 0.5];
  let sum = 0;
  let total = 0;
  done.forEach((r, k) => {
    const rank = Math.min(1, (r.finish! - 1) / (r.fieldSize! - 1));
    const gap = r.margin !== undefined ? Math.min(r.margin, 3) / 3 : rank;
    sum += weights[k] * (rank + gap) / 2;
    total += weights[k];
  });
  return sum / total;
}

export interface VerdictRecord {
  races: number; // 着順のあるレース数
  honmeiWin: number; // ◎ が1着
  honmeiTop3: number; // ◎ が3着以内
  marksInTop3: number; // ◎○▲ のうち3着以内に入った延べ頭数
  randomTop3: number; // でたらめに選んだときの ◎ の3着以内の期待回数 (比べる目安)
}

/** 保存したレースで、今の印の付け方ならどうだったかを数える */
export function verdictRecord(races: Race[], options: PredictOptions, offsetOf?: (w: Workout) => number): VerdictRecord {
  const rec: VerdictRecord = { races: 0, honmeiWin: 0, honmeiTop3: 0, marksInTop3: 0, randomTop3: 0 };
  for (const race of races) {
    const finish = (race.result?.finish ?? "").split(",").map(Number).filter(Boolean);
    if (finish.length < 3) continue;
    const marks = verdict(predict(race, options), race.horses, offsetOf);
    if (marks.length === 0) continue;
    rec.races++;
    const top3 = new Set(finish.slice(0, 3));
    if (finish[0] === marks[0].number) rec.honmeiWin++;
    if (top3.has(marks[0].number)) rec.honmeiTop3++;
    rec.marksInTop3 += marks.slice(0, 3).filter((m) => top3.has(m.number)).length;
    rec.randomTop3 += 3 / race.horses.filter((h) => !h.scratched).length;
  }
  rec.randomTop3 = Math.round(rec.randomTop3 * 10) / 10;
  return rec;
}
