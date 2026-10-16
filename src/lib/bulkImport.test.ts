import { describe, expect, it } from "vitest";
import { dateInPaste, importPastRace, isDuplicate } from "./bulkImport";

// 架空の馬 (importer.test.ts と同じもの)
const CARD = [
  "1", "1\t", "山田太", "54", "0.0.0.3", "12.5", "チチ", "牝2", "アオゾラ", "ハハ", "鹿", "ハハチチ",
  "7川1 9.7 30ポイ 7頭", "3", "1400ダ1.43.4", "山田太 54", "M 42.7-39.7", "②\t2\t2\t3", "カチウマ 0.5 398", "3枠2人",
  "2", "2\t", "鈴木次", "55", "0.0.0.0", "3.1", "チチ", "牡2", "ユウヒ", "ハハ", "栗", "ハハチチ",
  "7川5 9.11 新馬 7頭", "1", "1400ダ1.40.1", "鈴木次 54", "S 41.2-38.7", "1\t1\t1\t1", "ニチャク 0.3 501", "4枠1人",
  "3", "3\t", "田中三", "54", "0.0.0.0", "8.0", "チチ", "牝2", "ホシゾラ", "ハハ", "鹿", "ハハチチ",
  "7川5 9.11 新馬 7頭", "4", "1400ダ1.41.0", "田中三 54", "S 42.0-39.5", "4\t4\t4\t4", "カチウマ 0.9 470", "5枠3人",
].join("\n");
const RESULT = "1\t2\t\nユウヒ\n牡2 鈴木次 55\n川某\n1\t1\t1\t1\n1.40.0\n(38.0)\n2\t1\t\nアオゾラ\n牝2 山田太 54\n川某\n2\t2\t2\t2\n1.40.3\n(38.4)\n3\t3\t\nホシゾラ\n牝2 田中三 54\n川某\n4\t4\t3\t3\n1.40.9\n(38.9)";

describe("dateInPaste", () => {
  it("年付きの日付を読む", () => {
    expect(dateInPaste("2025年10月1日(水) 川崎5R")).toBe("2025-10-01");
    expect(dateInPaste("2025/9/7")).toBe("2025-09-07");
    expect(dateInPaste("9/7 川崎")).toBeUndefined();
  });
});

describe("importPastRace", () => {
  it("日付がないと保存しない", () => {
    expect(importPastRace({ card: CARD })).toEqual({ error: expect.stringContaining("日付") });
  });

  it("馬柱と結果から1つのレースを作る", () => {
    const r = importPastRace({ card: CARD, result: RESULT, date: "2025-10-14", line: "川崎 5R ダ1400" });
    if ("error" in r) throw new Error(r.error);
    expect(r.race).toMatchObject({ name: "川崎5R", venue: "川崎", distance: 1400, date: "2025-10-14" });
    expect(r.race.horses).toHaveLength(3);
    expect(r.race.result?.finish).toBe("2,1,3");
  });

  it("馬柱でないものは断る", () => {
    expect(importPastRace({ card: "こんにちは", date: "2025-10-14" })).toHaveProperty("error");
  });

  it("同じレースの二重取り込みを見分ける", () => {
    const r = importPastRace({ card: CARD, date: "2025-10-14", line: "川崎 5R ダ1400" });
    if ("error" in r) throw new Error(r.error);
    expect(isDuplicate(r.race, [r.race])).toBe(true);
    expect(isDuplicate(r.race, [{ ...r.race, date: "2025-10-15" }])).toBe(false);
  });
});
