import { describe, expect, it } from "vitest";
import { learnMarkWeights } from "./markLearn";
import { DEFAULT_OPTIONS } from "./predict";
import type { Race } from "./types";

// 展開では強い馬ほど後ろ (ゴール前の想定は逆) だが、近走の着順が良い馬ほど実際に上位に来るレース
const raceWhereFormWins = (k: number): Race => {
  const order = [3, 7, 1, 9, 5, 2, 8, 4, 6, 10].map((n) => ((n + k) % 10) + 1);
  const horses = Array.from({ length: 10 }, (_, i) => {
    const number = i + 1;
    const rank = order.indexOf(number); // 0 = 一番強い
    return {
      number,
      frame: number,
      name: `H${number}`,
      pastRaces: [{ passing: [10 - rank, 10 - rank], fieldSize: 10, finish: rank + 1, margin: rank * 0.3 }],
    };
  });
  return {
    id: `r${k}`, name: `R${k}`, venue: "川崎", surface: "ダ", distance: 1400, horses,
    result: { firstCorner: "", finalCorner: "", finish: order.join(",") },
  };
};

describe("learnMarkWeights", () => {
  it("レースが少ないうちは学習しない", () => {
    expect(learnMarkWeights([1, 2, 3].map(raceWhereFormWins), DEFAULT_OPTIONS)).toBeUndefined();
  });

  it("近走の成績どおりに決まるレースが続けば、近走の成績の重みを上げる", () => {
    const r = learnMarkWeights(Array.from({ length: 12 }, (_, k) => raceWhereFormWins(k)), DEFAULT_OPTIONS)!;
    expect(r.races).toBe(12);
    // この材料 (展開と近走) の中で、近走の割合が今 (0.2 / 0.5) より大きくなる
    expect(r.weights.form / (r.weights.form + r.weights.goal)).toBeGreaterThan(0.4);
    expect(r.improved).toBe(true);
    expect(r.after).toBeLessThanOrEqual(r.before);
    expect(r.holdout).toBeLessThan(r.before);
  });
});
