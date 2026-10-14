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

/** 重みの候補: 0〜0.6 を 0.1 刻みで、合計が今の重みと同じ 1.1 になる組み合わせ (今の重みも候補に入る) */
function candidates(): MarkWeights[] {
  const out: MarkWeights[] = [];
  const steps = [0, 1, 2, 3, 4, 5, 6];
  for (const g of steps)
    for (const f of steps)
      for (const l of steps)
        for (const r of steps) {
          const t = 11 - g - f - l - r;
          if (t < 0 || t > 6) continue;
          out.push({ goal: g / 10, form: f / 10, lap: l / 10, rise: r / 10, talk: t / 10 });
        }
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

/** 平均着順が一番良い重み (同じくらいなら今の重みに近い方) */
function best(cases: Case[], list: MarkWeights[]): MarkWeights {
  let top = DEFAULT_WEIGHTS;
  let topScore = Infinity;
  for (const w of list) {
    const score = cases.reduce((s, c) => s + scoreCase(c, w), 0) / cases.length + 0.05 * distance(w);
    if (score < topScore) {
      topScore = score;
      top = w;
    }
  }
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
  const avg = (w: MarkWeights) => cases.reduce((s, c) => s + scoreCase(c, w), 0) / cases.length;
  const weights = best(cases, list);
  let held = 0;
  cases.forEach((c, k) => {
    held += scoreCase(c, best(cases.filter((_, j) => j !== k), list));
  });
  const round = (v: number) => Math.round(v * 100) / 100;
  const before = round(avg(DEFAULT_WEIGHTS));
  const holdout = round(held / cases.length);
  return { races: cases.length, weights, before, after: round(avg(weights)), holdout, improved: holdout < before - 0.1 };
}
