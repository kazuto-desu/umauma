import { describe, expect, it } from "vitest";
import { learnAxisWeights } from "./markLearn";
import { DEFAULT_OPTIONS } from "./predict";
import type { Horse, Race } from "./types";

// 近走の着順どおりに決まり、先行する馬 (展開で有利に見える馬) は来ないレース
const horse = (n: number): Horse => ({
  number: n,
  frame: n,
  name: `H${n}`,
  pastRaces: [1, 2, 3].map((k) => ({ passing: [7 - n, 7 - n], fieldSize: 6, finish: n, margin: (n - 1) * 0.4, date: `9/${k * 5}` })),
});
const race = (k: number): Race => ({
  id: `r${k}`, name: "", venue: "川崎", surface: "ダ", distance: 1400, date: "2026-10-14",
  horses: [1, 2, 3, 4, 5, 6].map(horse),
  result: { firstCorner: "", finalCorner: "", finish: "1,2,3,4,5,6" },
});

describe("learnAxisWeights", () => {
  it("レースが少ないうちは学習しない", () => {
    expect(learnAxisWeights([race(1)], DEFAULT_OPTIONS)).toBeUndefined();
  });

  it("軸候補がよく来る材料 (ここでは近走の成績) の重みを上げる", () => {
    const r = learnAxisWeights(Array.from({ length: 15 }, (_, k) => race(k)), DEFAULT_OPTIONS)!;
    expect(r.races).toBe(15);
    expect(r.holdout).toBeGreaterThanOrEqual(r.before);
    expect(r.after).toBe(1);
    expect(r.weights.form).toBeGreaterThan(0);
  });
});
