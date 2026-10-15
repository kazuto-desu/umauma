import { boardPicks } from "./picks";
import type { AxisMode, SignalEffect } from "./picks";
import { predict } from "./predict";
import { signalsOf } from "./signals";
import type { MarkWeights, PredictOptions, Race, Workout } from "./types";
import { WEIGHT_KEYS, materials, ranking } from "./verdict";

export type MaterialKey = (typeof WEIGHT_KEYS)[number];

export interface Tally {
  count: number; // 候補になった延べ頭数
  top3: number; // そのうち3着以内
  wins: number;
}

export interface PickRecord {
  races: number;
  axis: Record<AxisMode, Tally>; // 軸候補 (型優先 / 総合順位だけ)
  ana: Tally;
  keshi: Tally;
  all: Tally; // 出走馬全体 (比べる目安)
  materials: Record<MaterialKey, Tally>; // その材料だけで上位2頭を選んだとき (材料がある馬が3頭以上のレースだけ)
}

/** 軸の選び方を成績で切り替えるのに必要なレース数 */
export const MIN_AXIS_RACES = 15;

const empty = (): Tally => ({ count: 0, top3: 0, wins: 0 });

/**
 * 保存したレース (着順のあるもの) で、そのとき軸・穴・消し候補に選ばれていた馬が実際どうだったかを数える。
 * 今の選び方で選び直して数えるので、選び方を変えても過去のレースで比べられる。
 */
export function pickRecord(
  races: Race[],
  options: PredictOptions,
  offsetOf: (w: Workout) => number = () => 0,
  effect: (key: string) => SignalEffect = () => "normal",
  venue?: string,
  weights: MarkWeights | undefined = options.markWeights,
): PickRecord {
  const rec: PickRecord = {
    races: 0,
    axis: { types: empty(), rank: empty() },
    ana: empty(),
    keshi: empty(),
    all: empty(),
    materials: Object.fromEntries(WEIGHT_KEYS.map((k) => [k, empty()])) as Record<MaterialKey, Tally>,
  };
  const add = (t: Tally, n: number, finish: number[]) => {
    t.count++;
    if (finish.slice(0, 3).includes(n)) t.top3++;
    if (finish[0] === n) t.wins++;
  };
  for (const race of races) {
    if (venue && race.venue !== venue) continue;
    const finish = (race.result?.finish ?? "").split(",").map(Number).filter(Boolean);
    if (finish.length < 3) continue;
    const runners = race.horses.filter((h) => !h.scratched);
    if (runners.length < 4) continue;
    rec.races++;
    const prediction = predict(race, options);
    const ranked = ranking(prediction, race.horses, offsetOf, weights);
    const signals = signalsOf(race, prediction);
    for (const mode of ["types", "rank"] as const) {
      const p = boardPicks(ranked, signals, effect, mode);
      for (const x of p.axis) add(rec.axis[mode], x.number, finish);
      if (mode === "types") {
        for (const x of p.ana) add(rec.ana, x.number, finish);
        for (const x of p.keshi) add(rec.keshi, x.number, finish);
      }
    }
    for (const h of runners) add(rec.all, h.number, finish);
    // 材料を1つだけ使ったら、軸候補はどうだったか
    const m = materials(prediction, race.horses, offsetOf);
    for (const k of WEIGHT_KEYS) {
      const known = m.runners
        .map((a, i) => ({ n: a.number, v: m.values[i][k], g: a.goal! }))
        .filter((x): x is { n: number; v: number; g: number } => x.v !== undefined);
      if (known.length < 3) continue;
      known.sort((a, b) => a.v - b.v || a.g - b.g);
      for (const x of known.slice(0, 2)) add(rec.materials[k], x.n, finish);
    }
  }
  return rec;
}

/** 保存したレースが十分あれば、軸候補の3着内率が高い方の選び方を使う */
export function bestAxisMode(rec: PickRecord): AxisMode {
  if (rec.races < MIN_AXIS_RACES) return "types";
  const rate = (t: Tally) => (t.count > 0 ? t.top3 / t.count : 0);
  return rate(rec.axis.rank) > rate(rec.axis.types) ? "rank" : "types";
}
