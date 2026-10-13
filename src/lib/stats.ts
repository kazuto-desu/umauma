import { predict } from "./predict";
import { compare, parseCornerNotation } from "./result";
import type { HorseAnalysis, PredictOptions, Race } from "./types";

export interface Bias {
  key: string;
  label: string; // 例: "逃げ・先行の馬 (1コーナー)"
  count: number; // 対象の延べ頭数
  mean: number; // 実際 − 予想 の平均 (プラスなら実際は予想より後ろ)
  advice?: string; // ずれが大きいときの見直しの目安
}

export interface Stats {
  races: number; // 結果のあるレース数
  first?: number; // 1コーナーの平均のずれ (頭)
  final?: number;
  goal?: number;
  biases: Bias[];
}

/** 偏りとみなす平均のずれ (頭) と、判断に必要な延べ頭数 */
const BIAS_THRESHOLD = 0.8;
const MIN_COUNT = 5;
const MIN_RACES = 3; // 1〜2レースだけの偏りはたまたまのことが多い

interface Row {
  a: HorseAnalysis;
  diff: number; // 実際の順位 − 予想の順位 (あとで「端の効果」を差し引いた値に置き換える)
  gate: number; // 0 = 最内 〜 1 = 大外
  pred: number; // 予想の順位 − 中央の順位
  act: number; // 実際の順位 − 中央の順位
}

/**
 * 「端の効果」を差し引く。予想で前の方に置いた馬は外れると必ず後ろに、後ろに置いた馬は必ず前にずれる
 * (順位には上限・下限があるため)。全馬で「実際の順位 ≒ β × 予想の順位」(中央からの距離) の β を求め、
 * 各馬のずれを「実際 − β × 予想」にする。こうすると、どの馬にも共通の戻りを除いた、グループ固有の偏りが残る。
 */
function removeEdgeEffect(rows: Row[]): Row[] {
  const sxx = rows.reduce((s, r) => s + r.pred * r.pred, 0);
  const beta = sxx > 0 ? rows.reduce((s, r) => s + r.pred * r.act, 0) / sxx : 1;
  return rows.map((r) => ({ ...r, diff: r.act - beta * r.pred }));
}

/**
 * 保存したレースのうち結果のあるものを、今の予想の仕組みで予想し直して結果と比べる。
 * 平均のずれに加えて、脚質・枠・調子・末脚ごとに「予想より前/後ろになりやすいか」を出す。
 */
export function computeStats(races: Race[], options: PredictOptions): Stats {
  const withResult = races.filter((r) => r.result?.firstCorner || r.result?.finish);
  const means = { first: [] as number[], final: [] as number[], goal: [] as number[] };
  const rows = { first: [] as Row[], final: [] as Row[], goal: [] as Row[] };

  for (const race of withResult) {
    const p = predict(race, options);
    const runners = race.horses.filter((h) => !h.scratched);
    const gateOf = (n: number) => (runners.length > 1 ? (n - 1) / (runners.length - 1) : 0);
    const pairs = [
      ["first", p.firstCorner, race.result!.firstCorner],
      ["final", p.finalCorner, race.result!.finalCorner],
      ["goal", p.goal, race.result!.finish ?? ""],
    ] as const;
    for (const [key, predicted, notation] of pairs) {
      const actual = parseCornerNotation(notation, race.horses);
      if (actual.length < 2) continue;
      const c = compare(predicted, actual);
      means[key].push(c.meanAbs);
      for (const row of c.rows) {
        const a = p.analyses.find((x) => x.number === row.number);
        const center = (c.rows.length + 1) / 2;
        if (a)
          rows[key].push({
            a,
            diff: row.diff,
            gate: gateOf(row.number),
            pred: row.predicted - center,
            act: row.actual - center,
          });
      }
    }
  }

  rows.first = removeEdgeEffect(rows.first);
  rows.final = removeEdgeEffect(rows.final);
  rows.goal = removeEdgeEffect(rows.goal);

  const avg = (v: number[]) => (v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : undefined);
  const bias = (key: string, label: string, list: Row[], advice: (mean: number) => string): Bias | undefined => {
    if (list.length === 0) return undefined;
    const mean = Math.round((list.reduce((s, r) => s + r.diff, 0) / list.length) * 10) / 10;
    const notable = withResult.length >= MIN_RACES && list.length >= MIN_COUNT && Math.abs(mean) >= BIAS_THRESHOLD;
    return { key, label, count: list.length, mean, ...(notable ? { advice: advice(mean) } : {}) };
  };
  const dir = (mean: number) => (mean > 0 ? "後ろ" : "前");

  const biases = [
    bias("front", "逃げ・先行の馬 (1コーナー)", rows.first.filter((r) => r.a.style === "逃げ" || r.a.style === "先行"), (m) =>
      `実際は予想より平均${Math.abs(m)}頭${dir(m)}。逃げ・先行馬を${m > 0 ? "前に置きすぎ" : "後ろに置きすぎ"}です`,
    ),
    bias("back", "差し・追込の馬 (1コーナー)", rows.first.filter((r) => r.a.style === "差し" || r.a.style === "追込"), (m) =>
      `実際は予想より平均${Math.abs(m)}頭${dir(m)}。差し・追込馬を${m > 0 ? "前に置きすぎ" : "後ろに置きすぎ"}です`,
    ),
    bias("inner", "内枠の馬 (1コーナー)", rows.first.filter((r) => r.gate <= 0.3), (m) =>
      `実際は予想より平均${Math.abs(m)}頭${dir(m)}。「枠順の影響」を${m > 0 ? "弱め" : "強め"}にすると合いそうです`,
    ),
    bias("outer", "外枠の馬 (1コーナー)", rows.first.filter((r) => r.gate >= 0.7), (m) =>
      `実際は予想より平均${Math.abs(m)}頭${dir(m)}。「枠順の影響」を${m > 0 ? "強め" : "弱め"}にすると合いそうです`,
    ),
    bias("bad", "調教で調子落ちの馬 (最終コーナー)", rows.final.filter((r) => (r.a.condition?.value ?? 0) >= 0.25), (m) =>
      `実際は予想より平均${Math.abs(m)}頭${dir(m)}。調子落ちの補正が${m > 0 ? "弱すぎ" : "強すぎ"}です`,
    ),
    bias("good", "調教で好調の馬 (最終コーナー)", rows.final.filter((r) => (r.a.condition?.value ?? 0) <= -0.25), (m) =>
      `実際は予想より平均${Math.abs(m)}頭${dir(m)}。好調の補正が${m > 0 ? "強すぎ" : "弱すぎ"}です`,
    ),
    bias("closer", "末脚のある馬 (着順)", rows.goal.filter((r) => r.a.goal !== undefined && r.a.late - r.a.goal >= 0.05), (m) =>
      `実際は予想より平均${Math.abs(m)}頭${dir(m)}。直線での伸びを${m > 0 ? "高く見すぎ" : "低く見すぎ"}です`,
    ),
  ].filter((b): b is Bias => b !== undefined);

  return { races: withResult.length, first: avg(means.first), final: avg(means.final), goal: avg(means.goal), biases };
}
