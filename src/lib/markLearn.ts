import { predict } from "./predict";
import type { MarkWeights, PredictOptions, Race, Workout } from "./types";
import { DEFAULT_WEIGHTS, WEIGHT_KEYS, materials, totalOf } from "./verdict";

export const MIN_MARK_RACES = 10;

export interface MarkLearnResult {
  races: number; // 学習に使ったレース数
  weights: MarkWeights; // 学習した重み
  before: number; // 今の重みでの ◎○▲ の平均着順
  after: number; // 学習した重みでの ◎○▲ の平均着順 (学習に使ったレースで)
  holdout: number; // 1レースずつ抜いて学習し、抜いたレースで確かめた平均着順 (初見のレースでの実力)
  improved: boolean; // 初見のレースでも今より良くなるか
}

interface Case {
  values: Record<(typeof WEIGHT_KEYS)[number], number | undefined>[];
  goals: number[];
  finishOf: number[]; // 馬ごとの着順 (着順のない馬は最下位扱い)
}

/** 重みの候補: 材料ごとに 0〜0.6 を 0.1 刻みで、合計が今の重みと同じになる組み合わせ (今の重みも候補に入る) */
export function candidates(): MarkWeights[] {
  const total = Math.round(WEIGHT_KEYS.reduce((s, k) => s + DEFAULT_WEIGHTS[k], 0) * 10);
  const out: MarkWeights[] = [];
  const walk = (k: number, left: number, acc: number[]) => {
    if (k === WEIGHT_KEYS.length - 1) {
      if (left <= 6) out.push(Object.fromEntries(WEIGHT_KEYS.map((key, x) => [key, (x === k ? left : acc[x]) / 10])) as unknown as MarkWeights);
      return;
    }
    for (let v = 0; v <= Math.min(6, left); v++) walk(k + 1, left - v, [...acc, v]);
  };
  walk(0, total, []);
  return out;
}

/** その重みで ◎○▲ を付けたとき、3頭の実際の着順の平均 */
function scoreCase(c: Case, w: MarkWeights): number {
  const order = c.values
    .map((v, i) => ({ i, t: totalOf(v, w) }))
    .sort((a, b) => a.t - b.t || c.goals[a.i] - c.goals[b.i])
    .slice(0, 3);
  return order.reduce((s, x) => s + c.finishOf[x.i], 0) / order.length;
}

const distance = (w: MarkWeights) => WEIGHT_KEYS.reduce((s, k) => s + Math.abs(w[k] - DEFAULT_WEIGHTS[k]), 0);

/** 合計の着順 (sums) が一番良い重み (同じくらいなら今の重みに近い方) */
function best(sums: number[], count: number, list: MarkWeights[]): number {
  let top = 0;
  let topScore = Infinity;
  list.forEach((w, x) => {
    const score = sums[x] / count + 0.05 * distance(w);
    if (score < topScore) {
      topScore = score;
      top = x;
    }
  });
  return top;
}

/**
 * 保存したレース (着順のあるもの) で、どの重みなら ◎○▲ が一番上の着順に来たかを探す。
 * 1レースずつ抜いて学習し、抜いたレースで確かめた成績が今の重みより良いときだけ「良くなった」とする。
 */
export function learnMarkWeights(races: Race[], options: PredictOptions, offsetOf?: (w: Workout) => number): MarkLearnResult | undefined {
  const cases: Case[] = [];
  for (const race of races) {
    const finish = (race.result?.finish ?? "").split(",").map(Number).filter(Boolean);
    if (finish.length < 3) continue;
    const m = materials(predict(race, options), race.horses, offsetOf);
    if (m.runners.length < 4) continue;
    cases.push({
      values: m.values,
      goals: m.runners.map((a) => a.goal!),
      finishOf: m.runners.map((a) => {
        const k = finish.indexOf(a.number);
        return k >= 0 ? k + 1 : m.runners.length;
      }),
    });
  }
  if (cases.length < MIN_MARK_RACES) return undefined;

  const list = candidates();
  // レースごと・重みごとの ◎○▲ の平均着順を先に計算しておく (1レース抜きの学習もこの表から足し引きで出す)
  const table = cases.map((c) => list.map((w) => scoreCase(c, w)));
  const sums = list.map((_, x) => table.reduce((s, row) => s + row[x], 0));
  const weights = list[best(sums, cases.length, list)];
  let held = 0;
  table.forEach((row) => {
    const x = best(sums.map((v, y) => v - row[y]), cases.length - 1, list);
    held += row[x];
  });
  const avg = (w: MarkWeights) => cases.reduce((s, c) => s + scoreCase(c, w), 0) / cases.length;
  const round = (v: number) => Math.round(v * 100) / 100;
  const before = round(avg(DEFAULT_WEIGHTS));
  const holdout = round(held / cases.length);
  return { races: cases.length, weights, before, after: round(avg(weights)), holdout, improved: holdout < before - 0.1 };
}

export interface AxisLearnResult {
  races: number;
  weights: MarkWeights; // 軸候補が一番来た重み
  before: number; // 今の重みでの軸候補 (総合上位2頭) の3着内率
  after: number; // 学習した重みでの3着内率 (学習に使ったレースで)
  holdout: number; // 1レースずつ抜いて学習し、抜いたレースで確かめた3着内率
  improved: boolean; // 初見のレースでも今より良くなるか
}

/**
 * 軸の重みの候補。総合は重みの比率だけで決まるので、材料ごとに 0・0.3・0.6 の組み合わせ (と今の重み) を試す。
 * スマホでも軽く済むよう、細かい刻みにはしない。
 */
function axisCandidates(current: MarkWeights): MarkWeights[] {
  const out: MarkWeights[] = [current];
  const walk = (k: number, acc: number[]) => {
    if (k === WEIGHT_KEYS.length) {
      if (acc.some((v) => v > 0)) out.push(Object.fromEntries(WEIGHT_KEYS.map((key, x) => [key, acc[x]])) as unknown as MarkWeights);
      return;
    }
    for (const v of [0, 0.3, 0.6]) walk(k + 1, [...acc, v]);
  };
  walk(0, []);
  return out;
}

/** 重みの比率どうしの違い (0〜2) */
function shareDistance(a: MarkWeights, b: MarkWeights): number {
  const sa = WEIGHT_KEYS.reduce((s, k) => s + a[k], 0) || 1;
  const sb = WEIGHT_KEYS.reduce((s, k) => s + b[k], 0) || 1;
  return WEIGHT_KEYS.reduce((d, k) => d + Math.abs(a[k] / sa - b[k] / sb), 0);
}

/** その重みで総合上位2頭を選んだとき、3着内に来た頭数 (0〜2) */
function axisHits(c: Case, w: MarkWeights): number {
  return c.values
    .map((v, i) => ({ i, t: totalOf(v, w) }))
    .sort((a, b) => a.t - b.t || c.goals[a.i] - c.goals[b.i])
    .slice(0, 2)
    .filter((x) => c.finishOf[x.i] <= 3).length;
}

/**
 * 保存したレース (着順のあるもの) で、総合上位2頭 (軸候補) が一番3着内に来る材料の重みを探す。
 * 1レースずつ抜いて学習し、抜いたレースで確かめた3着内率が今の重みより良いときだけ「良くなった」とする。
 */
export function learnAxisWeights(
  races: Race[],
  options: PredictOptions,
  offsetOf?: (w: Workout) => number,
  current: MarkWeights = DEFAULT_WEIGHTS,
  minRaces = 15,
): AxisLearnResult | undefined {
  const cases: Case[] = [];
  for (const race of races) {
    const finish = (race.result?.finish ?? "").split(",").map(Number).filter(Boolean);
    if (finish.length < 3) continue;
    const m = materials(predict(race, options), race.horses, offsetOf);
    if (m.runners.length < 4) continue;
    cases.push({
      values: m.values,
      goals: m.runners.map((a) => a.goal!),
      finishOf: m.runners.map((a) => {
        const k = finish.indexOf(a.number);
        return k >= 0 ? k + 1 : m.runners.length;
      }),
    });
  }
  if (cases.length < minRaces) return undefined;

  const list = axisCandidates(current);
  const table = cases.map((c) => list.map((w) => axisHits(c, w)));
  const sums = list.map((_, x) => table.reduce((s, row) => s + row[x], 0));
  // 3着内の頭数が多い重み。同じくらいなら今の重みに近い方 (少ないレースに合わせすぎないように)
  const pickBest = (s: number[], count: number) => {
    let top = 0;
    let topScore = -Infinity;
    list.forEach((w, x) => {
      const score = s[x] / (count * 2) - 0.02 * shareDistance(w, current);
      if (score > topScore) {
        topScore = score;
        top = x;
      }
    });
    return top;
  };
  const weights = list[pickBest(sums, cases.length)];
  let held = 0;
  table.forEach((row) => {
    held += row[pickBest(sums.map((v, y) => v - row[y]), cases.length - 1)];
  });
  const rate = (w: MarkWeights) => cases.reduce((s, c) => s + axisHits(c, w), 0) / (cases.length * 2);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const before = round(rate(current));
  const holdout = round(held / (cases.length * 2));
  return { races: cases.length, weights, before, after: round(rate(weights)), holdout, improved: holdout >= before + 0.05 };
}
