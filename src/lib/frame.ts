/** JRA の枠色 */
export const FRAME_COLORS: Record<number, { bg: string; fg: string }> = {
  1: { bg: "#ffffff", fg: "#111111" },
  2: { bg: "#222222", fg: "#ffffff" },
  3: { bg: "#e60012", fg: "#ffffff" },
  4: { bg: "#1e5bc6", fg: "#ffffff" },
  5: { bg: "#ffd900", fg: "#111111" },
  6: { bg: "#00a040", fg: "#ffffff" },
  7: { bg: "#f39800", fg: "#111111" },
  8: { bg: "#f5a3c7", fg: "#111111" },
};

export function frameColor(frame: number) {
  return FRAME_COLORS[frame] ?? { bg: "#999999", fg: "#ffffff" };
}

/**
 * 馬番と頭数から枠番を求める (JRA の枠割り)。
 * 8頭以下は馬番 = 枠番。9頭以上は外枠から順に2頭 (3頭) 入りになる。
 */
export function frameOf(number: number, fieldSize: number): number {
  if (fieldSize <= 8) return number;
  const base = Math.floor(fieldSize / 8);
  const extra = fieldSize % 8; // 外側 extra 枠が base+1 頭
  const innerFrames = 8 - extra;
  const innerCount = innerFrames * base;
  if (number <= innerCount) return Math.ceil(number / base);
  return innerFrames + Math.ceil((number - innerCount) / (base + 1));
}
