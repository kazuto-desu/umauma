import { describe, expect, it } from "vitest";
import { parseBookJraCard, passingOf } from "./bookJraCard";
import { importAny } from "./importer";
import { predict } from "./predict";

// 架空の馬。競馬ブックの中央の馬柱 (1項目1行・近走は古い順)
const CARD = [
  "1", "1\t", "50.6", "◎", "逃", "56\t山", "田", "太",
  "チチ牡 2 鹿", "アオゾラ", "ハハ馬主", "ハハチチ牧場", "調教師(美)", "0-0-1-1", "逃1先0差0追0",
  "2福7･12 新馬 16頭9", "1800芝B1.52.3鈴木次 55  ", "S37.3-36.9内S52", "カチウマ2.44401枠12人",
  "4中9･22 未勝利 14頭1", "1200芝外C1.11.4山田太 55  ", "M34.9-36.5最内S67", "ニチャク0.645610枠5人",
  "2", "2\t", "48.5", "・", "追", "★", "51\t田", "中", "三",
  "チチ牝 2 栗", "(外) ユウヒ", "ハハ馬主", "ハハチチ牧場", "調教師(栗)", "0-0-0-1", "逃0先0差0追0",
  "1札8･1 未勝利 9頭6", "1200ダ1.16.1田中三 52  ", "H36.1-40.0最内S33", "カチウマ2.54442枠6人",
].join("\n");

describe("parseBookJraCard", () => {
  it("出走馬・脚質・近走を読み、近走を新しい順にする", () => {
    const [a, b] = parseBookJraCard(CARD);
    expect(a).toMatchObject({ frame: 1, number: 1, name: "アオゾラ", jockey: "山田太", carried: 56, sire: "チチ", styleHint: "逃" });
    expect(a.pastRaces.map((r) => r.date)).toEqual(["9/22", "7/12"]);
    expect(a.pastRaces[0]).toMatchObject({ venue: "中山", surface: "芝", distance: 1200, fieldSize: 14, finish: 1, margin: 0, pace: "M", first3f: 34.9, last3f: 36.5, className: "未勝利", classLevel: 4 });
    expect(a.pastRaces[1]).toMatchObject({ venue: "福島", distance: 1800, finish: 9, margin: 2.4, jockey: "鈴木次" });
    // 「(外)」の印を外し、減量の記号 (★) は脚質と取り違えない
    expect(b).toMatchObject({ name: "ユウヒ", jockey: "田中三", carried: 51, styleHint: "追" });
    expect(b.pastRaces[0]).toMatchObject({ surface: "ダ", distance: 1200, finish: 6, margin: 2.5 });
  });

  it("通過順がなくても脚質の印から位置取りを見積もる", () => {
    const r = importAny(CARD, { name: "", venue: "中山", surface: "芝", distance: 1200, horses: [] });
    if ("error" in r) throw new Error(r.error);
    expect(r.kind).toBe("card");
    const styles = predict(r.race).analyses.map((x) => x.style);
    expect(styles).toEqual(["逃げ", "追込"]);
  });
});

describe("passingOf", () => {
  it("通過順があれば読み、なければ何も返さない", () => {
    expect(passingOf("5-5-4内S73", 10)).toEqual({ passing: [5, 5, 4] });
    expect(passingOf("⑤⑤④中61", 10)).toEqual({ passing: [5, 5, 4] });
    expect(passingOf("12 11 外 55", 16)).toEqual({ passing: [12, 11] });
    expect(passingOf("内S73", 10)).toEqual({});
    expect(passingOf("S60", 11)).toEqual({});
  });
});
