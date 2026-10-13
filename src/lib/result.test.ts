import { describe, expect, it } from "vitest";
import { compare, extractCorners, parseCornerNotation, parseResultTable, resultFromTable } from "./result";
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

describe("地方の結果表", () => {
  // 1頭1行の結果表をコピーしたときの形 (馬名は架空)
  const TABLE = `着順\t枠\t馬番\t馬名\t所属\t性齢\t負担
重量\t騎手（所属）\t調教師\t馬体重
（増減）\tタイム\t着差\t上がり
3F\tコーナー
通過順\t人気\t単勝
オッズ
1\t1\t1\tサンプルワン\t川崎\t牝 3\t52.0\t△騎手A （川崎）\t調教師A\t486(4)\t0:55.7\t\t37.8\t1-1-1\t7\t22.7
2\t2\t2\tサンプルツー\t川崎\t牝 4\t54.0\t騎手B （川崎）\t調教師B\t445(-4)\t0:56.3\t3\t37.5\t7-9-6\t10\t43.2
3\t3\t3\tサンプルスリー\t浦和\t牝 3\t54.0\t騎手C （浦和）\t調教師C\t424(4)\t0:56.3\tクビ\t37.3\t1-5-3\t5\t10.9
4\t4\t4\tサンプルフォー\t川崎\t牡 3\t56.0\t騎手D （川崎）\t調教師D\t458(1)\t0:56.6\t1.1/2\t38.0\t1-1-2\t9\t32.8
取消\t5\t5\tサンプルファイブ\t川崎\t牡 6\t56.0\t騎手E （川崎）\t調教師E\t465(-2)\t\t\t\t\t\t`;

  it("1頭1行の表から着順・馬番・通過順を読む (見出しや着差の 1.1/2 は無視)", () => {
    expect(parseResultTable(TABLE)).toEqual([
      { finish: 1, number: 1, name: "サンプルワン", passing: [1, 1, 1] },
      { finish: 2, number: 2, name: "サンプルツー", passing: [7, 9, 6] },
      { finish: 3, number: 3, name: "サンプルスリー", passing: [1, 5, 3] },
      { finish: 4, number: 4, name: "サンプルフォー", passing: [1, 1, 2] },
      { finish: undefined, number: 5, name: "サンプルファイブ", passing: [] },
    ]);
  });

  it("同じ位置の馬は横並びにして、最初・最後のコーナーの表記と着順を作る", () => {
    expect(resultFromTable(parseResultTable(TABLE))).toEqual({
      firstCorner: "(1,3,4)2",
      finalCorner: "1,4,3,2",
      finish: "1,2,3,4",
    });
  });
});
