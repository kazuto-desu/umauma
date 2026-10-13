import type { HorseAnalysis, Prediction } from "./types";

export interface Pick {
  number: number;
  name: string;
  reasons: string[];
}

/** 最終コーナーでこの位置 (0=先頭〜1=最後方) より前にいる馬を「前で直線に向く馬」とみなす */
const FRONT_LINE = 0.4;

/**
 * 予想から「前残り」「差し」のオススメをそれぞれ2頭選ぶ。
 *   前残り: 最終コーナーを前の方で回る馬のうち、ゴール前の想定位置が良い順
 *   差し:   最終コーナーを後ろの方で回る馬のうち、ゴール前の想定位置が良い順
 * 同じ馬が両方に入ることはない。
 */
export function recommend(prediction: Prediction): { front: Pick[]; closer: Pick[] } {
  const list = prediction.analyses.filter((a) => a.goal !== undefined);
  const rank = rankOf(list);
  const byGoal = (a: HorseAnalysis, b: HorseAnalysis) => a.goal! - b.goal!;

  const front = list
    .filter((a) => a.late < FRONT_LINE)
    .sort(byGoal)
    .slice(0, 2)
    .map((a) => pick(a, rank, prediction, "front"));
  const taken = new Set(front.map((p) => p.number));
  const closer = list
    .filter((a) => a.late >= FRONT_LINE && !taken.has(a.number))
    .sort(byGoal)
    .slice(0, 2)
    .map((a) => pick(a, rank, prediction, "closer"));
  return { front, closer };
}

/** 1コーナー・最終コーナー・ゴール前それぞれの想定順位 */
function rankOf(list: HorseAnalysis[]) {
  const order = (key: "early" | "late" | "goal") => {
    const sorted = [...list].sort((a, b) => a[key]! - b[key]!);
    return new Map(sorted.map((a, i) => [a.number, i + 1]));
  };
  return { early: order("early"), late: order("late"), goal: order("goal") };
}

function pick(a: HorseAnalysis, rank: ReturnType<typeof rankOf>, p: Prediction, kind: "front" | "closer"): Pick {
  const reasons = [
    `${rank.early.get(a.number)}番手 → 4角${rank.late.get(a.number)}番手 → ゴール前${rank.goal.get(a.number)}番手の想定`,
  ];
  if (a.advantage === "有利" || a.advantage === "やや有利") reasons.push(`展開${a.advantage}`);
  if (kind === "front" && p.pace === "スロー") reasons.push("スローペースで前が残りやすい");
  if (kind === "closer" && p.pace === "ハイ") reasons.push("ハイペースで差しが届きやすい");
  if (a.closing === "S" || a.closing === "A") reasons.push(`末脚${a.closing}`);
  if (a.condition && a.condition.value <= -0.25) reasons.push(`調教${a.condition.label}`);
  if (a.condition && a.condition.value >= 0.25) reasons.push(`調教${a.condition.label}に注意`);
  return { number: a.number, name: a.name, reasons };
}
