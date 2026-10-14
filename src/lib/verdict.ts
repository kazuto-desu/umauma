import { predict } from "./predict";
import { latestWorkout, risingOf, scoreWorkout } from "./training";
import { readComment } from "./comment";
import { paddockScores, readPaddock } from "./paddock";
import { fieldClass, formOf } from "./form";
import type { Horse, MarkWeights, PredictOptions, Prediction, Race, Workout } from "./types";

export type Mark = "◎" | "○" | "▲" | "△";
const MARKS: Mark[] = ["◎", "○", "▲", "△", "△"];

export interface VerdictRow {
  number: number;
  name: string;
  mark: Mark;
  reasons: string[];
  odds?: number; // 単勝オッズ (オッズを入れたときの表示用。印には使わない)
  popularity?: number; // 人気順
}

/** 印の順位より人気がこれだけ下なら「妙味あり」 */
const VALUE_GAP = 3;

/** 印の材料の重み (初期値)。保存したレースから学習した重みがあればそちらを使う */
export const DEFAULT_WEIGHTS: MarkWeights = { goal: 0.3, form: 0.2, lap: 0.6, rise: 0.4, talk: 0.1, paddock: 0.1 };
export const WEIGHT_KEYS = ["goal", "form", "lap", "rise", "talk", "paddock"] as const;

// 0 (一番良い) 〜 1 (一番悪い) の順位にする。値が無い馬は undefined
const pct = (values: (number | undefined)[], lowerIsBetter: boolean) => {
  const known = values.filter((v): v is number => v !== undefined).sort((a, b) => (lowerIsBetter ? a - b : b - a));
  // 同じ値の馬は順位の平均にする (横並びの馬がまとめて最上位扱いにならないように)
  const rank = (v: number) => (known.indexOf(v) + known.lastIndexOf(v)) / 2;
  return values.map((v) => (v === undefined || known.length < 2 ? undefined : rank(v) / (known.length - 1)));
};

/** 印の材料を馬ごとに 0 (良い) 〜 1 (悪い) にそろえる */
export function materials(prediction: Prediction, horses: Horse[], offsetOf: (w: Workout) => number = () => 0) {
  const runners = prediction.analyses.filter((a) => a.goal !== undefined);
  const horseOf = (n: number) => horses.find((h) => h.number === n)!;
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
  // 近走の成績は、今回のメンバーの前走クラスの真ん中を基準にクラスの上下を見直す
  const refClass = fieldClass(runners.map((a) => horseOf(a.number)));
  const form = pct(runners.map((a) => formOf(horseOf(a.number).pastRaces, refClass)), true);
  const readings = runners.map((a) => {
    const c = horseOf(a.number).stableComment;
    return c ? readComment(c) : undefined;
  });
  const talk = pct(readings.map((r) => r?.mood), false);
  const paddock = pct(paddockScores(runners.map((a) => horseOf(a.number))), false);
  const values = runners.map((_, i) => ({ goal: goal[i], form: form[i], lap: lap[i], rise: rise[i], talk: talk[i], paddock: paddock[i] }));
  return { runners, horseOf, values, lap, rise, form, risings, readings, refClass };
}

/** 材料を重みで平均する (小さいほど良い)。材料がない分は除いて重みを付け直す */
export function totalOf(v: Record<(typeof WEIGHT_KEYS)[number], number | undefined>, w: MarkWeights): number {
  let sum = 0;
  let total = 0;
  for (const k of WEIGHT_KEYS) {
    const x = v[k];
    if (x === undefined || w[k] <= 0) continue;
    sum += x * w[k];
    total += w[k];
  }
  return total > 0 ? sum / total : 1;
}

/**
 * いろいろな材料を1つの順位にまとめて印を付ける。初期の重みは
 *   ゴール前の想定位置 (展開・ペース・コース・末脚・調子をすべて含む) … 0.3
 *   近走の着順・勝ち馬とのタイム差 (出走馬の中での順位) … 0.2
 *   最終追い切りのラップの良さ (出走馬の中での順位) … 0.6
 *   調子の上昇度 (出走馬の中での順位) … 0.4
 *   厩舎コメントの状態 (良い言葉・割り引き材料) … 0.1
 *   パドック評価 (評価の印と短評) … 0.1
 * 材料がない馬は、その分を除いて重みを付け直す。
 * 単勝オッズは印には使わない (人気に引っぱられると妙味がなくなるため)。
 * オッズが入っていれば表示用に添え、印の順位より人気のない馬に「妙味あり」を付ける。
 */
export function verdict(
  prediction: Prediction,
  horses: Horse[],
  offsetOf: (w: Workout) => number = () => 0,
  weights: MarkWeights = DEFAULT_WEIGHTS,
): VerdictRow[] {
  const { runners, horseOf, values, lap, rise, form, risings, readings, refClass } = materials(prediction, horses, offsetOf);
  if (runners.length === 0) return [];
  const scored = runners.map((a, i) => ({ a, i, total: totalOf(values[i], weights) }));
  scored.sort((x, y) => x.total - y.total || x.a.goal! - y.a.goal!);

  // オッズは表示と「妙味あり」の判定だけに使う (印の順位は変えない)
  const odds = runners.map((a) => horseOf(a.number).odds);
  const useOdds = hasOdds(horses);
  const ownRank = new Map(scored.map((x, k) => [x.a.number, k + 1]));
  const popularity = new Map(
    runners
      .filter((_, i) => odds[i] !== undefined)
      .sort((x, y) => horseOf(x.number).odds! - horseOf(y.number).odds!)
      .map((a, k) => [a.number, k + 1]),
  );

  const goalRank = new Map([...runners].sort((x, y) => x.goal! - y.goal!).map((a, k) => [a.number, k + 1]));
  return scored.slice(0, MARKS.length).map(({ a, i }, k) => {
    const reasons = [`ゴール前${goalRank.get(a.number)}番手の想定`];
    if (a.advantage === "有利" || a.advantage === "やや有利") reasons.push(`展開${a.advantage}`);
    const last = horseOf(a.number).pastRaces.find((r) => r.finish);
    if (last?.finish && last.finish <= 3) reasons.push(`前走${last.className ? `${last.className}で` : ""}${last.finish}着`);
    else if (form[i] !== undefined && form[i]! <= 0.25) reasons.push("近走の成績上位");
    const top = Math.max(...horseOf(a.number).pastRaces.slice(0, 3).map((r) => r.classLevel ?? -Infinity));
    if (refClass !== undefined && top >= refClass + 1) reasons.push("上のクラスで走った経験");
    if (lap[i] !== undefined && lap[i]! <= 0.25) reasons.push("調教ラップ上位");
    if (rise[i] !== undefined && rise[i]! <= 0.25 && (risings[i]?.score ?? 0) > 0) reasons.push("調子上昇");
    if (a.closing === "S") reasons.push("末脚上位");
    if (a.condition && a.condition.value >= 0.25) reasons.push("調教で調子落ちに注意");
    const r = readings[i];
    if (r && r.tags.length > 0) reasons.push(`厩舎談話: ${r.tags.join("・")}`);
    const pd = horseOf(a.number).paddock;
    if (pd) reasons.push(`パドック: ${readPaddock(pd).tags.join("・") || "掲載あり"}`);
    const pop = popularity.get(a.number);
    if (useOdds && pop !== undefined && pop - ownRank.get(a.number)! >= VALUE_GAP) reasons.unshift(`妙味あり (${pop}番人気)`);
    return {
      number: a.number,
      name: a.name,
      mark: MARKS[k],
      reasons,
      ...(useOdds && odds[i] !== undefined ? { odds: odds[i], popularity: pop } : {}),
    };
  });
}

/** 半分以上の馬に単勝オッズが入っているか */
export function hasOdds(horses: Horse[]): boolean {
  const runners = horses.filter((h) => !h.scratched);
  return runners.length > 0 && runners.filter((h) => h.odds).length >= runners.length / 2;
}

export interface MarkStats {
  races: number;
  honmeiWin: number; // ◎ が1着
  honmeiTop3: number; // ◎ が3着以内
  honmeiReturn?: number; // ◎ の単勝を100円ずつ買ったときの回収率 (%)。オッズのあるレースだけ
}

export interface VerdictRecord extends MarkStats {
  marksInTop3: number; // ◎○▲ のうち3着以内に入った延べ頭数
  randomTop3: number; // でたらめに選んだときの ◎ の3着以内の期待回数 (比べる目安)
  // オッズを入れたレースだけでの ◎ の成績と単勝回収率
  odds?: MarkStats;
}

function tally(stats: MarkStats, honmei: number, finish: number[], odds?: number) {
  stats.races++;
  if (finish[0] === honmei) stats.honmeiWin++;
  if (finish.slice(0, 3).includes(honmei)) stats.honmeiTop3++;
  if (odds !== undefined) stats.honmeiReturn = (stats.honmeiReturn ?? 0) + (finish[0] === honmei ? odds * 100 : 0);
}

const emptyStats = (): MarkStats => ({ races: 0, honmeiWin: 0, honmeiTop3: 0 });
const toRate = (s: MarkStats) =>
  s.honmeiReturn !== undefined && s.races > 0 ? { ...s, honmeiReturn: Math.round(s.honmeiReturn / s.races) } : s;

/** 保存したレースで、今の印の付け方ならどうだったかを数える */
export function verdictRecord(races: Race[], options: PredictOptions, offsetOf?: (w: Workout) => number): VerdictRecord {
  const rec: VerdictRecord = { ...emptyStats(), marksInTop3: 0, randomTop3: 0 };
  const withOdds = emptyStats();
  for (const race of races) {
    const finish = (race.result?.finish ?? "").split(",").map(Number).filter(Boolean);
    if (finish.length < 3) continue;
    const p = predict(race, options);
    const marks = verdict(p, race.horses, offsetOf, options.markWeights);
    if (marks.length === 0) continue;
    const top3 = new Set(finish.slice(0, 3));
    const oddsOf = (n: number) => race.horses.find((h) => h.number === n)?.odds;
    tally(rec, marks[0].number, finish);
    rec.marksInTop3 += marks.slice(0, 3).filter((m) => top3.has(m.number)).length;
    rec.randomTop3 += 3 / race.horses.filter((h) => !h.scratched).length;
    if (hasOdds(race.horses)) {
      tally(withOdds, marks[0].number, finish, oddsOf(marks[0].number) ?? 0);
    }
  }
  rec.randomTop3 = Math.round(rec.randomTop3 * 10) / 10;
  if (withOdds.races > 0) rec.odds = toRate(withOdds);
  return rec;
}
