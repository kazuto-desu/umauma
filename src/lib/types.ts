/** 過去の1走分の成績 */
export interface PastRace {
  date?: string;
  venue?: string; // 競馬場 (例: 東京)
  surface?: "芝" | "ダ" | "障";
  distance?: number;
  fieldSize?: number; // 出走頭数
  passing: number[]; // コーナー通過順 (例: [3, 3, 2, 1])
  finish?: number; // 着順
  margin?: number; // 勝ち馬とのタイム差 (秒、勝ったときは 0)
  className?: string; // クラス (例: B2, 1勝, G3)
  classLevel?: number; // クラスの高さ (form.ts の classOf の物差し)
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
  odds?: number; // 単勝オッズ
  stableComment?: string; // 厩舎コメント
  workouts?: Workout[]; // 調教 (追い切り)
  trainingComment?: string; // 調教の短評 (例: 好調持続)
  trainingTrend?: string; // 調教の矢印 (→ ↑ ↓)
}

/** 追い切り1本。marks はゴールからの累計タイム (例: 5F 66.5, 4F 51.8, 3F 38.6, 1F 12.9) */
export interface Workout {
  date?: string; // "10/8"
  course?: string; // "大井外 良" など
  intensity?: string; // 馬なり・強め・一杯 など
  beforeLastRace?: boolean; // 「(前回)」= 前走前の追い切り
  partner?: string; // 併せ馬 (例: "○○（Ｃ１）馬なりの内同入")
  marks: { furlong: number; time: number }[];
}

export type Going = "良" | "稍重" | "重" | "不良";

/** レース後に貼り付ける実際の通過順 (JRA の表記: "(3,8)1-6,12(4,10)" など) */
export interface RaceResult {
  firstCorner: string;
  finalCorner: string;
  finish?: string; // 着順の馬番を上位から "1,2,7,11" のように
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
  isSample?: boolean; // サンプルのレース (自動保存しない)
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
  goal?: number; // ゴール前の想定位置
  races: number; // 判定に使った走数
  advantage: Advantage; // ペース・コースが脚質に合っているか
  closing?: ClosingRank; // 末脚 (上がり3Fの速さを出走馬の中で比べたもの)
  condition?: { label: string; value: number; reasons: string[] }; // 調教から見た調子
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
  goal: Placement[]; // ゴール前
}

export interface PredictOptions {
  gateWeight: number; // 枠順の影響度 (0〜2, 標準1)
  recentRaces: number; // 何走前まで見るか
  jockeyNotes?: Record<string, JockeyTendency>;
  useTraining?: boolean; // 調教の調子を位置取りに反映する (省略時は反映)
  useComments?: boolean; // 厩舎コメントの作戦・スタートの不安を位置取りに反映する (省略時は反映)
  tuning?: Tuning; // 保存したレースから学習した補正
  bias?: { front: number; inner: number }; // 当日の馬場の傾向 (bias.ts)
}

/** 予想の補正の強さ。初期値 (DEFAULT_TUNING) なら学習なしと同じ予想になる */
export interface Tuning {
  frontShift: number; // 逃げ・先行の馬の位置をずらす (マイナスで前寄り)
  backShift: number; // 差し・追込の馬の位置をずらす
  conditionScale: number; // 調教の調子の補正の倍率
  kickScale: number; // 直線の伸び (末脚) の倍率
}
