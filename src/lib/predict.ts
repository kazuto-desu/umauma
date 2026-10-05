import type {
  Horse,
  HorseAnalysis,
  Pace,
  Placement,
  PredictOptions,
  Prediction,
  RunningStyle,
} from "./types";

/** 新しい走ほど重く見る */
const RECENCY_WEIGHTS = [1, 0.85, 0.7, 0.55, 0.45, 0.35];

/** 2頭が同じレーンに並べないとみなす縦の間隔 (馬身) */
const MIN_GAP = 1.1;

export const DEFAULT_OPTIONS: PredictOptions = { gateWeight: 1, recentRaces: 5 };

export function predict(horses: Horse[], options: PredictOptions = DEFAULT_OPTIONS): Prediction {
  const fieldSize = horses.length;
  const base = horses.map((h) => analyzeHistory(h, options.recentRaces));

  // 枠順補正: 外枠ほど1コーナーまでに外を回らされ、位置を取りにくい
  const early = base.map((a, i) => {
    const gateNorm = fieldSize > 1 ? (horses[i].number - 1) / (fieldSize - 1) : 0;
    return clamp01(a.early + options.gateWeight * 0.12 * (gateNorm - 0.5));
  });

  const pace = estimatePace(early);

  // 最終コーナー: 過去の最終コーナー位置を軸に、今回の1コーナー位置を少し反映。
  // ハイペースなら前が苦しく後ろが押し上げ、スローなら前残り傾向。
  const paceShift = pace === "ハイ" ? 0.06 : pace === "スロー" ? -0.04 : 0;
  const late = base.map((a, i) => {
    const v = a.late * 0.7 + early[i] * 0.3;
    return clamp01(v + paceShift * (0.5 - early[i]) * 2);
  });

  const analyses: HorseAnalysis[] = horses.map((h, i) => ({
    number: h.number,
    frame: h.frame,
    name: h.name,
    style: base[i].races === 0 ? "不明" : styleOf(base[i].early),
    early: early[i],
    late: late[i],
    races: base[i].races,
  }));

  // 1コーナーは縦長、最終コーナーは馬群が凝縮する
  const firstSpread = Math.max(8, fieldSize * 1.1);
  const finalSpread = Math.max(6, fieldSize * 0.7);

  const firstCorner = layout(horses, early, firstSpread, (i) => {
    // 内枠は内、外枠は外を回りやすい
    const gateNorm = fieldSize > 1 ? (horses[i].number - 1) / (fieldSize - 1) : 0;
    return gateNorm * 3;
  });
  const finalCorner = layout(horses, late, finalSpread, (i) => {
    // 位置を押し上げてくる馬は外を回して進出する
    const gain = early[i] - late[i];
    return Math.max(0, gain * 12);
  });

  return { analyses, pace, firstCorner, finalCorner };
}

function analyzeHistory(horse: Horse, recentRaces: number) {
  let wSum = 0;
  let earlySum = 0;
  let lateSum = 0;
  const races = horse.pastRaces.filter((r) => r.passing.length > 0).slice(0, recentRaces);
  races.forEach((r, idx) => {
    const n = Math.max(r.fieldSize ?? 0, ...r.passing, 2);
    const w = RECENCY_WEIGHTS[idx] ?? 0.3;
    earlySum += w * ((r.passing[0] - 1) / (n - 1));
    lateSum += w * ((r.passing[r.passing.length - 1] - 1) / (n - 1));
    wSum += w;
  });
  if (wSum === 0) return { early: 0.5, late: 0.5, races: 0 };
  return { early: earlySum / wSum, late: lateSum / wSum, races: races.length };
}

export function styleOf(early: number): RunningStyle {
  if (early < 0.12) return "逃げ";
  if (early < 0.38) return "先行";
  if (early < 0.7) return "差し";
  return "追込";
}

function estimatePace(early: number[]): Pace {
  // 前に行きたい馬の数でペースを判定
  const leaders = early.filter((e) => e < 0.12).length;
  const forward = early.filter((e) => e < 0.3).length;
  if (leaders >= 3 || forward >= Math.max(5, early.length * 0.4)) return "ハイ";
  if (leaders <= 1 && forward <= Math.max(2, early.length * 0.2)) return "スロー";
  return "ミドル";
}

/**
 * 位置スコアを馬身に換算し、ぶつからないようにレーン (内外) を割り当てる。
 * 基本は内が空いていれば内へ入るが、preferredLane に近いレーンほど選ばれやすい。
 */
function layout(
  horses: Horse[],
  score: number[],
  spread: number,
  preferredLane: (i: number) => number,
): Placement[] {
  const min = Math.min(...score);
  const xs = score.map((s) => (s - min) * spread);
  const prefs = horses.map((_, i) => preferredLane(i));
  const byX = horses.map((_, i) => i).sort((a, b) => xs[a] - xs[b] || horses[a].number - horses[b].number);
  // ほぼ横並びの馬同士は、内を希望する馬から先に場所を決める
  const order: number[] = [];
  for (let k = 0; k < byX.length; ) {
    let end = k + 1;
    while (end < byX.length && xs[byX[end]] - xs[byX[k]] < MIN_GAP) end++;
    order.push(...byX.slice(k, end).sort((a, b) => prefs[a] - prefs[b]));
    k = end;
  }
  const placed: Placement[] = [];
  for (const i of order) {
    const x = xs[i];
    const pref = prefs[i];
    let best = 0;
    let bestCost = Infinity;
    for (let lane = 0; lane < 8; lane++) {
      const blocked = placed.some((p) => p.lane === lane && Math.abs(p.x - x) < MIN_GAP);
      if (blocked) continue;
      const cost = lane + Math.abs(lane - pref) * 0.6;
      if (cost < bestCost) {
        bestCost = cost;
        best = lane;
      }
    }
    placed.push({ number: horses[i].number, frame: horses[i].frame, name: horses[i].name, x, lane: best });
  }
  return placed;
}

/**
 * 隊列を通過順表記にする。例: "(1,5)8-3(4,6)"
 * ほぼ横並びの馬は ( ) でくくり、2馬身以上離れたら "-" でつなぐ。
 */
export function toNotation(placements: Placement[]): string {
  const sorted = [...placements].sort((a, b) => a.x - b.x || a.lane - b.lane);
  const groups: Placement[][] = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    if (g && p.x - g[0].x < 0.6) g.push(p);
    else groups.push([p]);
  }
  let out = "";
  groups.forEach((g, idx) => {
    if (idx > 0) {
      const gap = g[0].x - groups[idx - 1][0].x;
      const prevIsGroup = groups[idx - 1].length > 1;
      if (gap >= 2) out += "-";
      else if (!prevIsGroup && g.length === 1) out += ",";
    }
    const nums = [...g].sort((a, b) => a.lane - b.lane).map((p) => p.number);
    out += g.length > 1 ? `(${nums.join(",")})` : String(nums[0]);
  });
  return out;
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}
