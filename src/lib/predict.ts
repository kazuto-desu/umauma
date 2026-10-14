import { commentShift } from "./comment";
import { courseFactors, findCourse } from "./courses";
import { conditionOf, fieldMedianScore, latestWorkout, scoreWorkout } from "./training";
import type {
  Advantage,
  ClosingRank,
  Horse,
  HorseAnalysis,
  Pace,
  Placement,
  PredictOptions,
  Prediction,
  Race,
  RunningStyle,
  Tuning,
} from "./types";

/** 新しい走ほど重く見る */
const RECENCY_WEIGHTS = [1, 0.85, 0.7, 0.55, 0.45, 0.35];

/** 2頭が同じレーンに並べないとみなす縦の間隔 (馬身) */
const MIN_GAP = 1.1;

export const DEFAULT_OPTIONS: PredictOptions = { gateWeight: 1, recentRaces: 5 };
export const DEFAULT_TUNING: Tuning = { frontShift: 0, backShift: 0, conditionScale: 1, kickScale: 1 };

export function predict(race: Race, options: PredictOptions = DEFAULT_OPTIONS): Prediction {
  // 取消・除外の馬は隊列に入れない
  const horses = race.horses.filter((h) => !h.scratched);
  const fieldSize = horses.length;
  const course = findCourse(race.venue, race.surface, race.distance);
  const cf = courseFactors(course);
  const gf = goingFactors(race);
  const straightBias = cf.straightBias + gf.bias;
  const gateSlope = cf.gateSlope;
  const notes = [...(course ? cf.notes : []), ...gf.notes];
  const history = horses.map((h) => analyzeHistory(h, race, options.recentRaces));

  // 調教で時計が出ていない馬は調子落ちとみて、いつもの位置より後ろに。好調なら少し前に
  const median = fieldMedianScore(horses.map((h) => h.workouts));
  const conditions = horses.map((h) => conditionOf(h.workouts, h.trainingTrend, median));
  const tuning = options.tuning ?? DEFAULT_TUNING;
  const base = history.map((a, i) => {
    if (a.races === 0) return a;
    // 学習した脚質ごとのずれ
    const styleShift = a.early < 0.38 ? tuning.frontShift : tuning.backShift;
    const c = conditions[i];
    let k = 0;
    if (options.useTraining !== false && c) k = (c.value > 0 ? c.value : c.value * 0.4) * tuning.conditionScale; // 不調の影響の方が大きい
    return {
      ...a,
      early: clamp01(a.early + styleShift + 0.12 * k),
      late: clamp01(a.late + styleShift + 0.15 * k),
    };
  });

  // 騎手の傾向 (メモ) と枠順で補正。枠の影響の大きさはコースで変わる (直線・芝スタートでは外が有利)
  const gateNorm = (i: number) => (fieldSize > 1 ? (horses[i].number - 1) / (fieldSize - 1) : 0);
  const jockeyShift = (h: Horse) => {
    const t = h.jockey ? options.jockeyNotes?.[h.jockey] : undefined;
    return t === "積極" ? -0.06 : t === "控える" ? 0.06 : 0;
  };
  const early = base.map((a, i) =>
    clamp01(
      a.early +
        jockeyShift(horses[i]) +
        (options.useComments === false ? 0 : commentShift(horses[i])) +
        options.gateWeight * gateSlope * (gateNorm(i) - 0.5),
    ),
  );

  const pace = estimatePace(early);

  // 最終コーナー: 過去の最終コーナー位置を軸に、今回の1コーナー位置を少し反映。
  // ハイペースや長い直線なら後ろの馬が押し上げ、スローや短い直線なら前残り。
  const paceShift = (pace === "ハイ" ? 0.06 : pace === "スロー" ? -0.04 : 0) + straightBias;
  const lateOf = (a: { late: number }, e: number, shift: number) =>
    clamp01(a.late * 0.7 + e * 0.3 + shift * (0.5 - e) * 2);
  const late = base.map((a, i) => lateOf(a, early[i], paceShift));

  const closing = closingRanks(base.map((a) => a.last3f));
  const analyses: HorseAnalysis[] = horses.map((h, i) => {
    // 枠・ペース・コースの補正がなかった場合と比べて、どれだけ前に来られるか
    const neutral = lateOf(base[i], base[i].early, 0);
    return {
      number: h.number,
      frame: h.frame,
      name: h.name,
      style: history[i].races === 0 ? "不明" : styleOf(history[i].early),
      early: early[i],
      late: late[i],
      races: base[i].races,
      advantage: base[i].races === 0 ? "－" : advantageOf(neutral - late[i]),
      closing: closing[i],
      ...(conditions[i] ? { condition: conditions[i] } : {}),
    };
  });

  // 1コーナーは縦長、最終コーナーは馬群が凝縮する
  const firstSpread = Math.max(8, fieldSize * 1.1);
  const finalSpread = Math.max(6, fieldSize * 0.7);

  // 内枠は内、外枠は外を回りやすい (直線コースは逆)
  const firstCorner = layout(horses, early, firstSpread, (i) =>
    gateSlope >= 0 ? gateNorm(i) * 3 : (1 - gateNorm(i)) * 3,
  );
  const finalCorner = layout(horses, late, finalSpread, (i) => {
    // 位置を押し上げてくる馬は外を回して進出する
    const gain = early[i] - late[i];
    return Math.max(0, gain * 12) + gf.laneShift;
  });

  // ゴール前: 最終コーナーの位置から、末脚のある馬ほど直線で前に出る。直線が長いほど差が開く
  const straight = course?.straight || 350; // コース表にないコースは地方の平均的な直線を仮定
  const straightFactor = Math.min(1.3, Math.max(0.5, straight / 400));
  const kick = closingPower(closing, horses, median);
  const goalPos = late.map((l, i) => {
    const cond = options.useTraining === false ? 0 : Math.max(0, conditions[i]?.value ?? 0) * tuning.conditionScale;
    // 当日の馬場の傾向: 前残りなら最終コーナーで前の馬、内有利なら内枠の馬をゴール前で前に
    const bias = options.bias ? options.bias.front * (l - 0.5) * 1.2 + options.bias.inner * (gateNorm(i) - 0.5) : 0;
    return clamp01(l - 0.18 * kick[i] * straightFactor * tuning.kickScale + 0.05 * cond + bias);
  });
  analyses.forEach((a, i) => (a.goal = goalPos[i]));
  const goal = layout(horses, goalPos, Math.max(6, fieldSize * 0.9), (i) =>
    // 後ろから伸びてきた馬は外
    Math.max(0, (late[i] - goalPos[i]) * 15) + gf.laneShift,
  );

  return { analyses, pace, courseNotes: notes, firstCorner, finalCorner, goal };
}

/**
 * 直線での伸び (−1〜+1、プラスほど伸びる)。
 *   過去レースの上がり3F の順位 (S/A/B/C) と、最終追い切りの時計 (出走馬の中央値との差) を合わせる。
 *   地方の馬柱は上がりが載っていないことが多いので、調教がその補いになる。
 */
function closingPower(closing: (ClosingRank | undefined)[], horses: Horse[], median: number | undefined): number[] {
  const RANK: Record<ClosingRank, number> = { S: 1, A: 0.4, B: -0.2, C: -0.7 };
  return horses.map((h, i) => {
    const parts: { v: number; w: number }[] = [];
    const c = closing[i];
    if (c) parts.push({ v: RANK[c], w: 0.6 });
    const w = latestWorkout(h.workouts);
    const score = w ? scoreWorkout(w)?.score : undefined;
    if (score !== undefined && median !== undefined)
      parts.push({ v: Math.max(-1, Math.min(1, (median - score) / 0.6)), w: 0.4 });
    if (parts.length === 0) return 0;
    return parts.reduce((a, p) => a + p.v * p.w, 0) / parts.reduce((a, p) => a + p.w, 0);
  });
}

function advantageOf(diff: number): Advantage {
  if (diff > 0.05) return "有利";
  if (diff > 0.02) return "やや有利";
  if (diff < -0.05) return "不利";
  if (diff < -0.02) return "やや不利";
  return "－";
}

function analyzeHistory(horse: Horse, race: Race, recentRaces: number) {
  let wSum = 0;
  let earlySum = 0;
  let lateSum = 0;
  const races = horse.pastRaces.filter((r) => r.passing.length > 0).slice(0, recentRaces);
  races.forEach((r, idx) => {
    const n = Math.max(r.fieldSize ?? 0, ...r.passing, 2);
    let w = RECENCY_WEIGHTS[idx] ?? 0.3;
    // 芝とダートが違う過去走は参考度を下げる
    if (r.surface && race.surface !== "障" && r.surface !== race.surface) w *= 0.6;
    // 距離延長ならペースが緩んで前に行きやすく、短縮なら後ろになりやすい
    const distShift = r.distance && race.distance ? -0.15 * Math.log2(race.distance / r.distance) : 0;
    earlySum += w * clamp01((r.passing[0] - 1) / (n - 1) + distShift);
    lateSum += w * clamp01((r.passing[r.passing.length - 1] - 1) / (n - 1) + distShift * 0.5);
    wSum += w;
  });
  // 上がり3F: 今回と同じ馬場の過去走を優先して平均
  const with3f = races.filter((r) => r.last3f);
  const same = with3f.filter((r) => !r.surface || r.surface === race.surface);
  const pool = same.length > 0 ? same : with3f;
  const last3f = pool.length > 0 ? pool.reduce((s, r) => s + r.last3f!, 0) / pool.length : undefined;
  if (wSum === 0) return { early: 0.5, late: 0.5, races: 0, last3f };
  return { early: earlySum / wSum, late: lateSum / wSum, races: races.length, last3f };
}

/** 上がり3Fの平均を出走馬の中で比べて S/A/B/C を付ける (データのある馬が3頭未満なら付けない) */
function closingRanks(values: (number | undefined)[]): (ClosingRank | undefined)[] {
  const known = values.filter((v): v is number => v !== undefined).sort((a, b) => a - b);
  if (known.length < 3) return values.map(() => undefined);
  return values.map((v) => {
    if (v === undefined) return undefined;
    const pct = known.indexOf(v) / (known.length - 1); // 0 = 最速, 1 = 最遅
    return pct < 0.2 ? "S" : pct < 0.5 ? "A" : pct < 0.8 ? "B" : "C";
  });
}

/** 馬場状態による補正 */
function goingFactors(race: Race) {
  const level = race.going === "不良" ? 2 : race.going === "重" ? 1.5 : race.going === "稍重" ? 0.7 : 0;
  if (level === 0) return { bias: 0, laneShift: 0, notes: [] as string[] };
  if (race.surface === "ダ") {
    return {
      bias: -0.02 * level,
      laneShift: 0,
      notes: [`ダートの${race.going}。砂が締まって時計が速くなり、前が残りやすい`],
    };
  }
  return {
    bias: 0.015 * level,
    laneShift: level,
    notes: [`芝の${race.going}。内の馬場が荒れやすく、外を回る差し馬が伸びやすい`],
  };
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
