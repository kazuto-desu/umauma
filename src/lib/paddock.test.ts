import { describe, expect, it } from "vitest";
import { paddockScores, parsePaddock, readPaddock } from "./paddock";
import { DEFAULT_OPTIONS, predict } from "./predict";
import { parsePassingText } from "./notation";
import { verdict } from "./verdict";

// パドック評価の貼り付けの形 (馬名などは架空)
const TEXT = [
  "A", "⑤アオゾラ\t494(-5)\t3.3", "毛ヅヤ良化上昇ムード\t\t－",
  "B", "①ユウヒ\t408(+3)\t3.6", "細目なのは体形で\t\t－",
  "B", "③ホシゾラ\t473(+14)\t9.7", "イレ込み気味で発汗も\t\t－",
].join("\n");

describe("parsePaddock", () => {
  it("評価・馬番・馬名・馬体重・オッズ・短評を読む", () => {
    expect(parsePaddock(TEXT)).toEqual([
      { number: 5, name: "アオゾラ", grade: "A", comment: "毛ヅヤ良化上昇ムード", weight: 494, weightDiff: -5, odds: 3.3 },
      { number: 1, name: "ユウヒ", grade: "B", comment: "細目なのは体形で", weight: 408, weightDiff: 3, odds: 3.6 },
      { number: 3, name: "ホシゾラ", grade: "B", comment: "イレ込み気味で発汗も", weight: 473, weightDiff: 14, odds: 9.7 },
    ]);
  });
});

describe("readPaddock", () => {
  it("評価に短評を足し、悪い気配と大きな馬体重の増減を重く引く", () => {
    const [a, b, c] = parsePaddock(TEXT).map(readPaddock);
    expect(a).toMatchObject({ score: 1.3, tags: ["評価A", "上昇気配"] });
    expect(b).toMatchObject({ score: 0.5, tags: ["評価B"] }); // 「細目なのは体形」は割り引かない
    expect(c.hot).toBe(true);
    expect(c.tags).toEqual(["評価B", "イレ込み", "発汗", "馬体重+14"]);
    expect(c.score).toBeLessThan(0);
  });

  it("載っていない馬は評価Cと同じ 0 点", () => {
    const horses = [1, 2].map((n) => ({ number: n, frame: n, name: `H${n}`, pastRaces: [] }));
    expect(paddockScores(horses)).toEqual([undefined, undefined]);
    expect(paddockScores([{ ...horses[0], paddock: { grade: "A" } }, horses[1]])).toEqual([1, 0]);
  });
});

describe("パドック評価を結論に反映", () => {
  it("展開が同じなら、パドック評価の良い馬を上にする", () => {
    const horses = [1, 2, 3, 4].map((n) => ({
      number: n,
      frame: n,
      name: `H${n}`,
      pastRaces: parsePassingText("5-5/10 5-5/10"),
      ...(n === 4 ? { paddock: { grade: "A", comment: "気合十分で毛ヅヤ良" } } : {}),
    }));
    const race = { name: "", venue: "", surface: "ダ" as const, distance: 1400, horses };
    const v = verdict(predict(race, DEFAULT_OPTIONS), horses);
    expect(v[0].number).toBe(4);
    expect(v[0].reasons).toContain("パドック: 評価A・上昇気配・気合十分");
  });
});
