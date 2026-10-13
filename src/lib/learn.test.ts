import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, describeParams, learn } from "./learn";
import { parsePassingText } from "./notation";
import { DEFAULT_OPTIONS } from "./predict";
import type { Race } from "./types";

// 先行馬 (1〜3番、上がり遅め) と追込馬 (6〜8番、上がり速い) がいて、
// 実際のレースではいつも追込馬が直線で先行馬を差し切る (今の予想より末脚が効いている)
const horses = Array.from({ length: 8 }, (_, i) => ({
  number: i + 1,
  frame: i + 1,
  name: `H${i + 1}`,
  pastRaces: parsePassingText(i < 3 ? "3-3/8(37.0) 3-3/8(37.0)" : i >= 5 ? "5-5/8(34.0) 5-5/8(34.0)" : "4-4/8(35.5) 4-4/8(35.5)"),
}));
const race = (id: string): Race => ({
  id,
  name: id,
  venue: "川崎",
  surface: "ダ",
  distance: 1400,
  horses,
  result: { firstCorner: "1,2,3,4,5,6,7,8", finalCorner: "1,2,3,4,5,6,7,8", finish: "6,7,8,4,5,1,2,3" },
});

describe("learn", () => {
  it("レースが少ないうちは学習しない", async () => {
    expect(await learn([race("a"), race("b")], DEFAULT_OPTIONS)).toBeUndefined();
  });

  it("いつも同じ方向にずれるなら、それを直す値 (ここでは末脚を強く) を学び、初見のレースでも良くなる", async () => {
    const races = ["a", "b", "c", "d", "e", "f"].map(race);
    const progress: number[] = [];
    const r = (await learn(races, DEFAULT_OPTIONS, (x) => progress.push(x)))!;
    expect(r.races).toBe(6);
    expect(r.fitted).toBeLessThanOrEqual(r.baseline);
    expect(r.holdout).toBeLessThan(r.baseline);
    expect(r.improved).toBe(true);
    expect(r.params.tuning.kickScale).toBeGreaterThan(1);
    expect(progress.at(-1)).toBe(1);
  });

  it("学習した値を言葉にする", () => {
    expect(describeParams(DEFAULT_PARAMS)).toEqual(["初期設定のままが一番合っています"]);
    expect(
      describeParams({ gateWeight: 1.5, tuning: { frontShift: -0.03, backShift: 0, conditionScale: 0.5, kickScale: 2 } }),
    ).toEqual(["逃げ・先行の馬を前寄りに (-0.03)", "枠順の影響 1 → 1.5", "調教の調子の補正 ×0.5", "直線の伸び (末脚) ×2"]);
  });
});
