/**
 * JRA 主要コースの特徴 (目安)。
 * 数値は公開されているコース解説を元にした概算なので、気になるものは見直して直すこと。
 */
export interface Course {
  venue: string;
  surface: "芝" | "ダ";
  distance: number;
  firstCorner: number | null; // スタートから最初のコーナーまでの距離 (m)。直線コースは null
  straight: number; // 最後の直線の長さ (m)
  track?: "内" | "外"; // 内回り・外回り
  turfStart?: boolean; // ダートだがスタート地点が芝
}

export const VENUES = ["札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"] as const;

type Row = [string, "芝" | "ダ", number, number | null, number, ("内" | "外")?, boolean?];

// [競馬場, 馬場, 距離, 最初のコーナーまで, 直線, 内外回り, 芝スタート]
const ROWS: Row[] = [
  ["札幌", "芝", 1200, 406, 266],
  ["札幌", "芝", 1500, 170, 266],
  ["札幌", "芝", 1800, 185, 266],
  ["札幌", "芝", 2000, 385, 266],
  ["札幌", "ダ", 1000, 284, 264],
  ["札幌", "ダ", 1700, 241, 264],
  ["函館", "芝", 1200, 489, 262],
  ["函館", "芝", 1800, 275, 262],
  ["函館", "芝", 2000, 475, 262],
  ["函館", "ダ", 1000, 364, 260],
  ["函館", "ダ", 1700, 329, 260],
  ["福島", "芝", 1200, 412, 292],
  ["福島", "芝", 1800, 305, 292],
  ["福島", "芝", 2000, 505, 292],
  ["福島", "ダ", 1150, 300, 296, undefined, true],
  ["福島", "ダ", 1700, 342, 296],
  ["新潟", "芝", 1000, null, 0],
  ["新潟", "芝", 1200, 445, 359, "内"],
  ["新潟", "芝", 1400, 645, 359, "内"],
  ["新潟", "芝", 1600, 548, 659, "外"],
  ["新潟", "芝", 1800, 748, 659, "外"],
  ["新潟", "芝", 2000, 948, 659, "外"],
  ["新潟", "ダ", 1200, 525, 354, undefined, true],
  ["新潟", "ダ", 1800, 389, 354],
  ["東京", "芝", 1400, 342, 526],
  ["東京", "芝", 1600, 542, 526],
  ["東京", "芝", 1800, 156, 526],
  ["東京", "芝", 2000, 126, 526],
  ["東京", "芝", 2400, 349, 526],
  ["東京", "ダ", 1300, 342, 502],
  ["東京", "ダ", 1400, 442, 502, undefined, true],
  ["東京", "ダ", 1600, 640, 502, undefined, true],
  ["東京", "ダ", 2100, 240, 502],
  ["中山", "芝", 1200, 275, 310, "外"],
  ["中山", "芝", 1600, 240, 310, "外"],
  ["中山", "芝", 1800, 205, 310, "内"],
  ["中山", "芝", 2000, 405, 310, "内"],
  ["中山", "芝", 2500, 192, 310, "内"],
  ["中山", "ダ", 1200, 502, 308, undefined, true],
  ["中山", "ダ", 1800, 375, 308],
  ["中京", "芝", 1200, 315, 413],
  ["中京", "芝", 1400, 515, 413],
  ["中京", "芝", 1600, 200, 413],
  ["中京", "芝", 2000, 314, 413],
  ["中京", "芝", 2200, 514, 413],
  ["中京", "ダ", 1200, 407, 411],
  ["中京", "ダ", 1400, 607, 411, undefined, true],
  ["中京", "ダ", 1800, 291, 411],
  ["中京", "ダ", 1900, 391, 411],
  ["京都", "芝", 1200, 316, 328, "内"],
  ["京都", "芝", 1400, 512, 404, "外"],
  ["京都", "芝", 1600, 712, 404, "外"],
  ["京都", "芝", 1800, 912, 404, "外"],
  ["京都", "芝", 2000, 308, 328, "内"],
  ["京都", "芝", 2200, 397, 404, "外"],
  ["京都", "芝", 2400, 597, 404, "外"],
  ["京都", "芝", 3000, 217, 404, "外"],
  ["京都", "ダ", 1200, 407, 329],
  ["京都", "ダ", 1400, 607, 329, undefined, true],
  ["京都", "ダ", 1800, 285, 329],
  ["京都", "ダ", 1900, 385, 329],
  ["阪神", "芝", 1200, 258, 357, "内"],
  ["阪神", "芝", 1400, 443, 357, "内"],
  ["阪神", "芝", 1600, 444, 474, "外"],
  ["阪神", "芝", 1800, 644, 474, "外"],
  ["阪神", "芝", 2000, 325, 357, "内"],
  ["阪神", "芝", 2200, 525, 357, "内"],
  ["阪神", "芝", 2400, 600, 474, "外"],
  ["阪神", "ダ", 1200, 342, 353, undefined, true],
  ["阪神", "ダ", 1400, 525, 353, undefined, true],
  ["阪神", "ダ", 1800, 303, 353],
  ["阪神", "ダ", 2000, 500, 353, undefined, true],
  ["小倉", "芝", 1200, 479, 293],
  ["小倉", "芝", 1800, 272, 293],
  ["小倉", "芝", 2000, 472, 293],
  ["小倉", "ダ", 1000, 360, 291],
  ["小倉", "ダ", 1700, 343, 291],
];

export const COURSES: Course[] = ROWS.map(([venue, surface, distance, firstCorner, straight, track, turfStart]) => ({
  venue,
  surface,
  distance,
  firstCorner,
  straight,
  track,
  turfStart,
}));

export function findCourse(venue: string, surface: string, distance: number): Course | undefined {
  return COURSES.find((c) => c.venue === venue && c.surface === surface && c.distance === distance);
}

export function distancesFor(venue: string, surface: string): number[] {
  return COURSES.filter((c) => c.venue === venue && c.surface === surface).map((c) => c.distance);
}

/** コースから予想に使う補正値を作る */
export function courseFactors(course: Course | undefined) {
  if (!course) return { gateSlope: 0.12, straightBias: 0, notes: [] as string[] };
  const notes: string[] = [];
  let gateSlope: number;
  if (course.firstCorner === null) {
    // 直線コースは外ラチ沿いが有利
    gateSlope = -0.1;
    notes.push("直線コース。外枠が有利");
  } else {
    // 最初のコーナーが近いほど外枠は外を回らされて位置を取りにくい
    gateSlope = 0.12 * clamp(1.9 - course.firstCorner / 400, 0.5, 1.7);
    if (course.firstCorner < 300) notes.push(`最初のコーナーまで約${course.firstCorner}mと短く、内枠有利・外枠の先行馬は苦しい`);
    else if (course.firstCorner > 550) notes.push(`最初のコーナーまで約${course.firstCorner}mと長く、枠の有利不利は小さい`);
    else notes.push(`最初のコーナーまで約${course.firstCorner}m`);
  }
  if (course.turfStart) {
    gateSlope -= 0.08;
    notes.push("芝スタートのダート。外枠ほど芝を長く走れて行き脚がつきやすい");
  }
  // 直線が短いと前残り、長いと差しが届きやすい
  const straightBias = course.straight > 0 ? clamp((course.straight - 400) / 300, -0.6, 0.6) * 0.05 : 0;
  if (course.straight > 0) {
    if (course.straight < 320) notes.push(`直線約${course.straight}mと短く、先行有利`);
    else if (course.straight > 450) notes.push(`直線約${course.straight}mと長く、差しも届きやすい`);
    else notes.push(`直線約${course.straight}m`);
  }
  return { gateSlope, straightBias, notes };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
