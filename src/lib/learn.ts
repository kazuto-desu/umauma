import { DEFAULT_OPTIONS, DEFAULT_TUNING, predict } from "./predict";
import { compare, parseCornerNotation } from "./result";
import type { Placement, PredictOptions, Race, Tuning } from "./types";

/** 学習で調整する値 (枠順の影響 + 補正の強さ) */
export interface Params {
  gateWeight: number;
  tuning: Tuning;
}

export const DEFAULT_PARAMS: Params = { gateWeight: DEFAULT_OPTIONS.gateWeight, tuning: DEFAULT_TUNING };

// 試す値。少なめにして、少ないレース数でも合わせすぎないようにする
const GRID = {
  gateWeight: [0.5, 1, 1.5, 2],
  frontShift: [-0.06, -0.03, 0, 0.03, 0.06],
  backShift: [-0.06, -0.03, 0, 0.03, 0.06],
  conditionScale: [0, 0.5, 1, 1.5],
  kickScale: [0.5, 1, 1.5, 2],
} as const;
type Key = keyof typeof GRID;
const KEYS = Object.keys(GRID) as Key[];

/** 初期値から離れるほど少しずつ不利にする (頭) — 差がわずかなら初期値のままにするため */
const PENALTY = 0.03;

export const MIN_RACES = 5;

interface Case {
  race: Race;
  actual: { first: Placement[]; final: Placement[]; goal: Placement[] };
}

function toCases(races: Race[]): Case[] {
  return races
    .filter((r) => r.result?.firstCorner || r.result?.finish)
    .map((race) => ({
      race,
      actual: {
        first: parseCornerNotation(race.result!.firstCorner, race.horses),
        final: parseCornerNotation(race.result!.finalCorner, race.horses),
        goal: parseCornerNotation(race.result!.finish ?? "", race.horses),
      },
    }));
}

const get = (p: Params, k: Key) => (k === "gateWeight" ? p.gateWeight : p.tuning[k]);
const set = (p: Params, k: Key, v: number): Params =>
  k === "gateWeight" ? { ...p, gateWeight: v } : { ...p, tuning: { ...p.tuning, [k]: v } };

/** レースごとに 1コーナー・最終コーナー・着順の平均のずれを平均し、さらにレース全体で平均する (頭) */
function errorOf(cases: Case[], p: Params, base: PredictOptions): number {
  if (cases.length === 0) return 0;
  let sum = 0;
  for (const c of cases) {
    const pred = predict(c.race, { ...base, gateWeight: p.gateWeight, tuning: p.tuning });
    const parts = [
      [pred.firstCorner, c.actual.first],
      [pred.finalCorner, c.actual.final],
      [pred.goal, c.actual.goal],
    ]
      .filter(([, a]) => a.length >= 2)
      .map(([pr, a]) => compare(pr, a).meanAbs);
    sum += parts.length ? parts.reduce((x, y) => x + y, 0) / parts.length : 0;
  }
  return sum / cases.length;
}

function penalty(p: Params): number {
  return KEYS.reduce((s, k) => {
    const grid = GRID[k];
    const span = grid[grid.length - 1] - grid[0];
    return s + (PENALTY * Math.abs(get(p, k) - get(DEFAULT_PARAMS, k))) / span;
  }, 0);
}

/** 1つずつ値を動かして、ずれ (+ 初期値からの離れ具合) が一番小さくなる組み合わせを探す */
function fit(cases: Case[], base: PredictOptions): Params {
  let best = DEFAULT_PARAMS;
  let bestScore = errorOf(cases, best, base) + penalty(best);
  for (let pass = 0; pass < 2; pass++) {
    for (const k of KEYS) {
      for (const v of GRID[k]) {
        if (v === get(best, k)) continue;
        const cand = set(best, k, v);
        const score = errorOf(cases, cand, base) + penalty(cand);
        if (score < bestScore - 1e-9) {
          best = cand;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

export interface LearnResult {
  races: number;
  params: Params;
  baseline: number; // 学習前のずれ (頭)
  fitted: number; // 学習後、学習に使ったレースでのずれ
  holdout: number; // 1レースずつ抜いて学習し、抜いたレースで確かめたずれ (初見のレースでの実力)
  improved: boolean; // 初見のレースでも良くなったか
  learnedAt: string;
}

/**
 * 保存したレースから補正を学習する。
 * 学習に使ったレースで良くなるのは当たり前なので、1レースずつ抜いて学習 → 抜いたレースで確かめる
 * (leave-one-out) を全レースで行い、初見のレースでも良くなるかを確かめる。
 * onProgress で進み具合 (0〜1) を知らせ、合間に画面へ処理を返す。
 */
export async function learn(
  races: Race[],
  base: PredictOptions,
  onProgress?: (ratio: number) => void,
): Promise<LearnResult | undefined> {
  const cases = toCases(races);
  if (cases.length < MIN_RACES) return undefined;
  const opts = { ...base, tuning: undefined };
  const baseline = errorOf(cases, DEFAULT_PARAMS, opts);

  let held = 0;
  for (let i = 0; i < cases.length; i++) {
    const p = fit([...cases.slice(0, i), ...cases.slice(i + 1)], opts);
    held += errorOf([cases[i]], p, opts);
    onProgress?.((i + 1) / (cases.length + 1));
    await new Promise((r) => setTimeout(r, 0));
  }
  const params = fit(cases, opts);
  onProgress?.(1);
  const round = (v: number) => Math.round(v * 100) / 100;
  const holdout = round(held / cases.length);
  return {
    races: cases.length,
    params,
    baseline: round(baseline),
    fitted: round(errorOf(cases, params, opts)),
    holdout,
    improved: holdout < round(baseline) - 0.05,
    learnedAt: new Date().toISOString(),
  };
}

/** 学習した値を言葉で説明する */
export function describeParams(p: Params): string[] {
  const t = p.tuning;
  const out: string[] = [];
  const shift = (label: string, v: number) => {
    if (v !== 0) out.push(`${label}を${v < 0 ? "前寄り" : "後ろ寄り"}に (${v > 0 ? "+" : ""}${v})`);
  };
  shift("逃げ・先行の馬", t.frontShift);
  shift("差し・追込の馬", t.backShift);
  if (p.gateWeight !== DEFAULT_PARAMS.gateWeight) out.push(`枠順の影響 ${DEFAULT_PARAMS.gateWeight} → ${p.gateWeight}`);
  if (t.conditionScale !== 1)
    out.push(t.conditionScale === 0 ? "調教の調子の補正を使わない" : `調教の調子の補正 ×${t.conditionScale}`);
  if (t.kickScale !== 1) out.push(`直線の伸び (末脚) ×${t.kickScale}`);
  return out.length ? out : ["初期設定のままが一番合っています"];
}
