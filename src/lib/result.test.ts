import { describe, expect, it } from "vitest";
import { compare, extractCorners, parseCornerNotation } from "./result";
import type { Horse } from "./types";

const horses: Horse[] = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, frame: 1, name: `H${i + 1}`, pastRaces: [] }));

describe("parseCornerNotation", () => {
  it("横並び・区切り記号を位置に変換する", () => {
    const p = parseCornerNotation("(*3,8)1-6,12(4,10)=5", horses);
    const at = (n: number) => p.find((x) => x.number === n)!;
    expect(p.map((x) => x.number)).toEqual([3, 8, 1, 6, 12, 4, 10, 5]);
    expect([at(3).x, at(3).lane, at(8).x, at(8).lane]).toEqual([0, 0, 0, 1]);
    expect(at(1).x).toBe(1);
    expect(at(6).x).toBe(3.5);
    expect(at(12).x).toBe(4.5);
    expect([at(4).x, at(10).x, at(10).lane]).toEqual([5.5, 5.5, 1]);
    expect(at(5).x).toBe(11.5);
  });
});

describe("extractCorners", () => {
  it("結果ページのテキストから最初と最後のコーナーを拾う", () => {
    const text = "コーナー通過順位\n1コーナー\t(3,8)1-6\n2コーナー\t3,8,1,6\n3コーナー 3(8,1)6\n4コーナー\t3,1(8,6)\nラップ 12.3-11.0";
    expect(extractCorners(text)).toEqual({ firstCorner: "(3,8)1-6", finalCorner: "3,1(8,6)" });
  });
});

describe("compare", () => {
  it("順位のずれを出す", () => {
    const pred = parseCornerNotation("1,2,3", horses);
    const act = parseCornerNotation("3,1,2", horses);
    const r = compare(pred, act);
    expect(r.rows.map((x) => [x.number, x.diff])).toEqual([[3, -2], [1, 1], [2, 1]]);
    expect(r.meanAbs).toBeCloseTo(4 / 3);
  });
});
