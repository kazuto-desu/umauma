/** 過去の1走分の成績 */
export interface PastRace {
  date?: string;
  venue?: string; // 競馬場 (例: 東京)
  surface?: "芝" | "ダ" | "障";
  distance?: number;
  fieldSize?: number; // 出走頭数
  passing: number[]; // コーナー通過順 (例: [3, 3, 2, 1])
  finish?: number; // 着順
  last3f?: number; // 上がり3ハロン (秒)
}

/** 今回の出走馬 */
export interface Horse {
  number: number; // 馬番
  frame: number; // 枠番
  name: string;
  pastRaces: PastRace[]; // 新しい順
  scratched?: boolean; // 取消・除外
  jockey?: string; // 今回の騎手
}

export type Going = "良" | "稍重" | "重" | "不良";

/** レース後に貼り付ける実際の通過順 (JRA の表記: "(3,8)1-6,12(4,10)" など) */
export interface RaceResult {
  firstCorner: string;
  finalCorner: string;
}

export interface Race {
  id?: string;
  date?: string;
  name: string;
  venue: string;
  surface: "芝" | "ダ" | "障";
  distance: number;
  going?: Going;
  horses: Horse[];
  result?: RaceResult;
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
  advantage: Advantage; // ペース・コースが脚質に合っているか
  closing?: ClosingRank; // 末脚 (上がり3Fの速さを出走馬の中で比べたもの)
}

export type ClosingRank = "S" | "A" | "B" | "C";

/** 騎手の位置取りの傾向 (自分でメモしたもの) */
export type JockeyTendency = "積極" | "普通" | "控える";

export type Advantage = "有利" | "やや有利" | "－" | "やや不利" | "不利";

export type Pace = "ハイ" | "ミドル" | "スロー";

export interface Prediction {
  analyses: HorseAnalysis[];
  pace: Pace;
  courseNotes: string[];
  firstCorner: Placement[];
  finalCorner: Placement[];
}

export interface PredictOptions {
  gateWeight: number; // 枠順の影響度 (0〜2, 標準1)
  recentRaces: number; // 何走前まで見るか
  jockeyNotes?: Record<string, JockeyTendency>;
}
