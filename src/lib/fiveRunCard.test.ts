import { describe, expect, it } from "vitest";
import { parseFiveRunCard } from "./fiveRunCard";
import { importAny } from "./importer";

// 架空の馬。近5走が2行ずつ並ぶ形式 (同じ枠の2頭目は枠番が省かれる)
const CARD = [
  "1\t1\tアオゾラ\t山田太（愛知）\t5.1",
  "(2人気)\t",
  "全  \t1-\t0-\t0-\t2",
  "1:36.2\t良－",
  "7 26.09.30　重　12頭",
  "名古屋　右1500　4番",
  "1 26.09.14　不良　12頭",
  "名古屋　右1500　8番",
  "取消 26.08.20　良　11頭",
  "名古屋　右1500　1番",
  "15 26.08.02　良　17頭",
  "Ｊ新潟　芝左1400　18番",
  "牡3\t鹿毛\t04.20生\t▲ 54.0　0-0-0-1\tＣ８組\t３歳戦",
  "３歳未勝利",
  "３歳未勝利",
  "チチ\t調教師（愛知）\t469",
  "(-3)\t8人　472　▲山田太 54.0\t1人　468　鈴木次 57.0\t　－　鈴木次 57.0\t8人　470　田中三 55.0",
  "ハハ\t馬主\t1:36.2　6-9-11-10　39.6\t1:37.9　2-2-2-2　40.5\t　　\t1:22.9　3-5　36.6",
  "（ハハチチ）\t牧場\t\t3.7　カチウマ\t0.4　ニチャク\t　\t1.7　カチウマ",
  "2\tユウヒ\t鈴木次（笠松）\t12.0",
  "(4人気)\t",
  "全  \t0-\t0-\t0-\t1",
  "1:38.0\t良－",
  "4 26.09.29　不良　12頭",
  "名古屋　右1500　6番",
  " ",
  "牝3\t栗毛\t03.31生\t55.0　0-0-0-0\t３歳戦",
  "チチ\t調教師（愛知）\t465",
  "(+6)\t6人　459　鈴木次 55.0\t",
  "ハハ\t馬主\t1:38.0　1-1-1-1　40.7\t",
  "（ハハチチ）\t牧場\t\t0.6　カチウマ\t",
].join("\n");

describe("parseFiveRunCard", () => {
  it("出走馬と近走 (日付・競馬場・距離・着順・通過順・上がり・着差・騎手・斤量) を読む", () => {
    const [a, b] = parseFiveRunCard(CARD);
    expect(a).toMatchObject({ frame: 1, number: 1, name: "アオゾラ", jockey: "山田太", carried: 54, odds: 5.1, sire: "チチ", dam: "ハハ", damsire: "ハハチチ" });
    // 取消のレースは過去走に入れない
    expect(a.pastRaces).toHaveLength(3);
    expect(a.pastRaces[0]).toMatchObject({ date: "2026-09-30", venue: "名古屋", surface: "ダ", distance: 1500, fieldSize: 12, finish: 7, passing: [6, 9, 11, 10], last3f: 39.6, margin: 3.7, jockey: "山田太", carried: 54 });
    // 勝ったレースの着差は 0 (書かれているのは2着馬との差)
    expect(a.pastRaces[1]).toMatchObject({ finish: 1, margin: 0, jockey: "鈴木次" });
    // 中央のレース: 「Ｊ」を外し、芝と中央のクラスの高さ
    expect(a.pastRaces[2]).toMatchObject({ venue: "新潟", surface: "芝", distance: 1400, finish: 15, passing: [3, 5], className: "未勝利", classLevel: 4 });
    // 枠番が省かれた馬は前の馬と同じ枠
    expect(b).toMatchObject({ frame: 1, number: 2, name: "ユウヒ", carried: 55 });
    expect(b.pastRaces).toHaveLength(1);
  });

  it("貼り付けの種類を「馬柱」と見分ける", () => {
    const r = importAny(CARD, { name: "", venue: "名古屋", surface: "ダ", distance: 1500, horses: [] });
    expect(r).toMatchObject({ kind: "card" });
  });
});
