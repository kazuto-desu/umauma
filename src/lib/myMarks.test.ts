import { describe, expect, it } from "vitest";
import { myRecord } from "./myMarks";
import type { MyMark, Race } from "./types";

const race = (id: string, marks: Record<number, MyMark>, finish: string, odds?: number): Race => ({
  id,
  name: id,
  venue: "川崎",
  surface: "ダ",
  distance: 1400,
  horses: [1, 2, 3, 4, 5].map((n) => ({
    number: n,
    frame: n,
    name: `H${n}`,
    pastRaces: [],
    ...(marks[n] ? { myMark: marks[n] } : {}),
    ...(odds && marks[n] === "◎" ? { odds } : {}),
  })),
  result: { firstCorner: "", finalCorner: "", finish },
});

describe("myRecord", () => {
  it("自分の ◎ の勝ち・3着以内・単勝回収率と、印を付けた馬の3着内率を数える", () => {
    const r = myRecord([
      race("a", { 1: "◎", 2: "○", 5: "☆" }, "1,3,2", 4.0), // ◎1着、○3着内
      race("b", { 3: "◎", 4: "▲" }, "1,2,3", 6.0), // ◎3着
      race("c", { 2: "○" }, "2,1,3"), // ◎なしは数えない
      { ...race("d", { 1: "◎" }, ""), result: undefined }, // 結果なしは数えない
    ]);
    expect(r).toEqual({
      races: 2,
      honmeiWin: 1,
      honmeiTop3: 2,
      oddsRaces: 2,
      honmeiReturn: 200, // 400円 / 2レース
      marked: 4,
      markedTop3: 3,
    });
  });
});
