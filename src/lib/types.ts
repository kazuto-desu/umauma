/** 過去の1走分の成績 */
export interface PastRace {
  date?: string;
  venue?: string; // 競馬場 (例: 東京)
  surface?: "芝" | "ダ" | "障";
  distance?: number;
  fieldSize?: number; // 出走頭数
  passing: number[]; // コーナー通過順 (例: [3, 3, 2, 1])
  finish?: number; // 着順
}

/** 今回の出走馬 */
export interface Horse {
  number: number; // 馬番
  frame: number; // 枠番
  name: string;
  pastRaces: PastRace[]; // 新しい順
}

export interface Race {
  name: string;
  venue: string;
  surface: "芝" | "ダ" | "障";
  distance: number;
  horses: Horse[];
}

export type RunningStyle = "逃げ" | "先行" | "差し" | "追込" | "不明";

/** 隊列図に描く1頭分の位置 */
export interface Placement {
  number: number;
  frame: number;
  name: string;
  x: number; // 先頭からの距離 (馬身)
  lane: number; // 0 = 最内
}

export interface HorseAnalysis {
  number: number;
  frame: number;
  name: string;
  style: RunningStyle;
  early: number; // 1コーナー想定位置 0(先頭)〜1(最後方)
  late: number; // 最終コーナー想定位置
  races: number; // 判定に使った走数
}

export type Pace = "ハイ" | "ミドル" | "スロー";

export interface Prediction {
  analyses: HorseAnalysis[];
  pace: Pace;
  firstCorner: Placement[];
  finalCorner: Placement[];
}

export interface PredictOptions {
  gateWeight: number; // 枠順の影響度 (0〜2, 標準1)
  recentRaces: number; // 何走前まで見るか
}
