import { describe, expect, it } from "vitest";
import { parseOdds } from "./odds";

const horses = ["アオゾラ", "ユウヒ", "ホシゾラ"].map((name, i) => ({ number: i + 1, frame: i + 1, name, pastRaces: [] }));

describe("parseOdds", () => {
  it("馬名の後ろの単勝オッズを読み、斤量とは取り違えない", () => {
    const text = "1 1 アオゾラ 牝3 54.0 山田 12.5 5\n2 2 ユウヒ 牡3 56.0 鈴木 2.1 1人気\n3 3 ホシゾラ 牝3 54.0 田中 8.0";
    expect([...parseOdds(text, horses)]).toEqual([
      [1, 12.5],
      [2, 2.1],
      [3, 8],
    ]);
  });

  it("馬名がないときは「馬番 オッズ」の行を読む", () => {
    expect([...parseOdds("1 12.5\n2 2.1\n3 30.4", horses.map((h) => ({ ...h, name: "" })))]).toEqual([
      [1, 12.5],
      [2, 2.1],
      [3, 30.4],
    ]);
  });
});

describe("parseOdds (地方の馬柱)", () => {
  it("馬名より前にある単勝オッズを読み、過去走の勝ち馬のタイム差とは取り違えない", () => {
    const card = [
      "1", "1\t", "山田太", "54", "0.0.0.3", "12.5", "テストチチ", "牝2", "アオゾラ", "テストハハ",
      "5川④ 7.30 新馬 6頭", "6", "900ダ1.02.1", "山田太 54", "H -40.3", "　\t6\t6\t6", "カチウマ 1.3 396", "1枠6人",
      "2", "2\t", "鈴木次", "55", "0.0.0.1", "2.9", "テストチチ", "牡2", "ユウヒ", "テストハハ",
    ].join("\n");
    expect([...parseOdds(card, horses)]).toEqual([
      [1, 12.5],
      [2, 2.9],
    ]);
  });
});
