import { describe, expect, it } from "vitest";
import { parseNarCard } from "./narCard";
import { parsePastedCard } from "./paste";

// 地方競馬の馬柱 (1項目1行・3走前→前走の順) の形。馬名などは架空
const CARD = [
  "3走前\t2走前\t前走",
  "1", "1\t", "山田太", "54", "0.0.0.3", "12.5", "テストチチ", "牝2", "アオゾラ", "テストハハ", "鹿", "ハハチチ", "某氏", "川某", "0-0-0-3",
  "5川④ 7.30 新馬 6頭", "6", "900ダ1.02.1", "山田太 54", "H -40.3", "　\t⑥\t6\t6", "カチウマ 6.7 396", "1枠6人",
  "川 8.21 能力試験 4頭", "2", "800ダ(良)51.0", "山田太", "-37.8", "　\t1\t1\t1", "カチウマ 0.1 400", "4枠-人",
  "7川1 9.7 30ポイ 7頭", "3", "1400ダ1.43.4", "山田太 54", "M 42.7-39.7", "②\t2\t2\t3", "カチウマ 0.5 398", "3枠2人",
  "2", "2\t", "鈴木次", "△53", "0.0.0.0", "3.1", "テストチチ", "牡2", "ユウヒ", "テストハハ", "栗", "ハハチチ", "某氏", "川某", "0-0-0-1",
  "6川③ 8.20 未受賞, 9頭", "除", "1400ダ", "鈴木次 54", "H -", "　\t　\t　\t　", "カチウマ 505", "1枠-人",
  "7川5 9.11 新馬 7頭", "1", "1400ダ1.40.1", "鈴木次 54", "S 41.2-38.7", "1\t1\t1\t1", "(ニチャク) 0.3 501", "4枠1人",
].join("\n");

describe("parseNarCard", () => {
  it("馬番・枠・馬名・今回の騎手と、新しい順の過去走を取り出す", () => {
    const h = parseNarCard(CARD);
    expect(h.map((x) => [x.number, x.frame, x.name, x.jockey])).toEqual([
      [1, 1, "アオゾラ", "山田太"],
      [2, 2, "ユウヒ", "鈴木次"],
    ]);
    // 能力試験は除き、前走が先頭
    expect(h[0].pastRaces).toEqual([
      { date: "9/7", venue: "川崎", surface: "ダ", distance: 1400, fieldSize: 7, finish: 3, passing: [2, 2, 2, 3], last3f: 39.7 },
      { date: "7/30", venue: "川崎", surface: "ダ", distance: 900, fieldSize: 6, finish: 6, passing: [6, 6, 6], last3f: 40.3 },
    ]);
    // 除外のレースは含めない
    expect(h[1].pastRaces.map((r) => r.passing)).toEqual([[1, 1, 1, 1]]);
  });

  it("貼り付けで、調教で登録した馬に過去走と騎手を重ねる", () => {
    const current = [{ number: 0, frame: 0, name: "ユウヒ", pastRaces: [], workouts: [{ marks: [] }] }];
    const r = parsePastedCard(CARD, current)!;
    expect(r.mode).toBe("update");
    expect(r.horses.map((x) => x.name)).toEqual(["アオゾラ", "ユウヒ"]);
    expect(r.horses[1]).toMatchObject({ number: 2, jockey: "鈴木次", workouts: [{ marks: [] }] });
    expect(r.withPassing).toBe(2);
  });
});

describe("parsePastedCard (地方の馬柱)", () => {
  it("今の表が別のレースなら作り直す", () => {
    const other = [1, 2, 3].map((n) => ({ number: n + 5, frame: n, name: `ベツノウマ${"ア".repeat(n)}`, pastRaces: [] }));
    const r = parsePastedCard(CARD, other)!;
    expect(r.mode).toBe("new");
    expect(r.horses.map((x) => x.name)).toEqual(["アオゾラ", "ユウヒ"]);
  });
});
