import { describe, expect, it } from "vitest";
import { parsePassingText } from "./notation";
import { DEFAULT_OPTIONS } from "./predict";
import { computeStats } from "./stats";
import type { Race } from "./types";

const horses = Array.from({ length: 8 }, (_, i) => ({
  number: i + 1,
  frame: i + 1,
  name: `H${i + 1}`,
  // 1〜2番は逃げ・先行、7〜8番は追込
  pastRaces: parsePassingText(i < 2 ? "1-1/8 1-1/8" : i >= 6 ? "8-8/8 8-8/8" : "4-4/8 4-4/8"),
}));
const race = (id: string, firstCorner: string, finish?: string): Race => ({
  id,
  name: id,
  venue: "",
  surface: "ダ",
  distance: 1400,
  horses,
  result: { firstCorner, finalCorner: firstCorner, finish },
});

describe("computeStats", () => {
  it("結果のあるレースだけを数え、平均のずれを出す", () => {
    const s = computeStats([race("a", "1,2,3,4,5,6,7,8", "1,2,3,4,5,6,7,8"), { ...race("b", ""), result: undefined }], DEFAULT_OPTIONS);
    expect(s.races).toBe(1);
    expect(s.first).toBeDefined();
    expect(s.goal).toBeDefined();
  });

  it("逃げ・先行馬がいつも予想より後ろなら、置きすぎと教える", () => {
    // 実際は先行馬 (1,2) が後方、追込馬 (7,8) が前に
    const races = ["a", "b", "c"].map((id) => race(id, "7,8,3,4,5,6,1,2"));
    const front = computeStats(races, DEFAULT_OPTIONS).biases.find((b) => b.key === "front")!;
    expect(front.count).toBe(6);
    expect(front.mean).toBeGreaterThan(0.8);
    expect(front.advice).toContain("前に置きすぎ");
  });

  it("1〜2レースだけでは偏りの判断をしない", () => {
    const front = computeStats([race("a", "7,8,3,4,5,6,1,2")], DEFAULT_OPTIONS).biases.find((b) => b.key === "front")!;
    expect(front.advice).toBeUndefined();
  });
});
