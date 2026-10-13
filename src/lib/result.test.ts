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

describe("1頭が複数行に分かれた結果表", () => {
  // netkeiba の地方の結果をコピーしたときの形 (馬名は架空)
  const BLOCKS = `着
順\t馬
番\tM
y
印\t
馬名
性齢　騎手　斤量
厩舎　　通過順位
タイム
(上り3F)
着差\t馬体重
単勝
1\t1\t
サンプルワン
牝3 騎手A 52
川調教A
　\t1\t1\t1
55.7
(37.8)
486(+4)
22.7
7人気
2\t2\t
サンプルツー
牝4 騎手B 54
川調教B
　\t⑦\t9\t6
56.3
(37.5)
3
445(-4)
43.2
10人気
3\t4\t
サンプルフォー
牝4 騎手D 54
川調教D
　\t1\t5\t3
56.6
(38.4)
1 1/2
464(0)
2.5
1人気`;

  it("着順・馬番・馬名と、タブ区切り・丸数字の通過順を読む", () => {
    expect(parseResultTable(BLOCKS)).toEqual([
      { finish: 1, number: 1, name: "サンプルワン", passing: [1, 1, 1] },
      { finish: 2, number: 2, name: "サンプルツー", passing: [7, 9, 6] },
      { finish: 3, number: 4, name: "サンプルフォー", passing: [1, 5, 3] },
    ]);
  });

  it("答え合わせ用の表記と着順になる", () => {
    expect(resultFromTable(parseResultTable(BLOCKS))).toEqual({
      firstCorner: "(1,4)2",
      finalCorner: "1,4,2",
      finish: "1,2,4",
    });
  });
});

describe("地方の結果 (着順と馬番がタブ区切りの1行、競走中止あり)", () => {
  const block = (head: string, name: string, passing: string) =>
    [head, name, "牝2 山田太 54", "川某", passing, "1.40.0", "(40.0)", "1", "450(0)", "3.0", "1人気"].join("\n");
  const TEXT = [
    block("1\t3\t", "テストイチ", "4\t3\t4\t1"),
    block("2\t1\t", "テストニ", "1\t1\t1\t2"),
    block("3\t2\t", "テストサン", "③\t2\t2\t③"),
    block("中止\t4\t", "テストヨン", "2\t4\t落"),
  ].join("\n");

  it("「3 3 3 ④」のような通過順の行を結果の行と取り違えず、中止の馬は止まるまでの位置を読む", () => {
    const rows = parseResultTable(TEXT);
    expect(rows.map((r) => [r.finish, r.number, r.passing.join("-")])).toEqual([
      [1, 3, "4-3-4-1"],
      [2, 1, "1-1-1-2"],
      [3, 2, "3-2-2-3"],
      [undefined, 4, "2-4"],
    ]);
    expect(rows[3].stopped).toBe(true);
  });

  it("中止の馬は最終コーナーに入れない", () => {
    expect(resultFromTable(parseResultTable(TEXT))).toEqual({
      firstCorner: "1,4,2,3",
      finalCorner: "3,1,2",
      finish: "3,1,2",
    });
  });
});
