import { describe, expect, it } from "vitest";
import { frameOf } from "./frame";
import { parsePassingText } from "./notation";
import { predict, toNotation } from "./predict";
import { SAMPLE_RACE } from "./sample";

describe("frameOf", () => {
  it("8頭以下は馬番=枠番", () => {
    expect([1, 5, 8].map((n) => frameOf(n, 8))).toEqual([1, 5, 8]);
  });
  it("16頭は2頭ずつ", () => {
    expect([1, 2, 3, 15, 16].map((n) => frameOf(n, 16))).toEqual([1, 1, 2, 8, 8]);
  });
  it("18頭は7,8枠が3頭", () => {
    expect([12, 13, 15, 16, 18].map((n) => frameOf(n, 18))).toEqual([6, 7, 7, 8, 8]);
  });
  it("10頭は7,8枠が2頭", () => {
    expect([6, 7, 8, 9, 10].map((n) => frameOf(n, 10))).toEqual([6, 7, 7, 8, 8]);
  });
});

describe("parsePassingText", () => {
  it("通過順と頭数を読む", () => {
    expect(parsePassingText("3-3-2-1/16 ５-４")).toEqual([
      { passing: [3, 3, 2, 1], fieldSize: 16 },
      { passing: [5, 4], fieldSize: undefined },
    ]);
  });
});

describe("predict", () => {
  const p = predict(SAMPLE_RACE.horses);
  it("逃げ馬が1コーナーで先頭付近、追込馬が後方", () => {
    const pos = (n: number) => p.firstCorner.find((x) => x.number === n)!.x;
    expect(pos(3)).toBeLessThan(pos(5));
    expect(pos(8)).toBeLessThan(pos(11));
  });
  it("マクリ馬は最終コーナーで位置を上げる", () => {
    const a = p.analyses.find((x) => x.number === 13)!;
    expect(a.late).toBeLessThan(a.early);
  });
  it("同じレーンで重ならない", () => {
    for (const set of [p.firstCorner, p.finalCorner]) {
      for (const a of set)
        for (const b of set)
          if (a !== b && a.lane === b.lane) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(1.1);
    }
  });
  it("全頭が通過順表記に出る", () => {
    const nums = toNotation(p.firstCorner).match(/\d+/g)!.map(Number).sort((a, b) => a - b);
    expect(nums).toEqual(SAMPLE_RACE.horses.map((h) => h.number));
  });
});
