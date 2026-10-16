import { describe, expect, it } from "vitest";
import { applyRaceLine, nextRace, parseRaceLine, raceLineInPaste } from "./raceLine";
import type { Race } from "./types";

describe("parseRaceLine", () => {
  it("競馬場・R・距離・クラス・馬場状態を順番自由で読む", () => {
    expect(parseRaceLine("川崎 5R ダ1400 C2三 良")).toEqual({
      venue: "川崎", raceNo: 5, name: "川崎5R", surface: "ダ", distance: 1400, raceClass: "C2三", going: "良",
    });
    expect(parseRaceLine("B3 1500 大井11R 稍")).toMatchObject({ venue: "大井", raceNo: 11, distance: 1500, raceClass: "B3", going: "稍重" });
    expect(parseRaceLine("東京 第11競走 芝2400m G1")).toMatchObject({ venue: "東京", raceNo: 11, surface: "芝", distance: 2400, raceClass: "G1" });
    expect(parseRaceLine("船橋 2歳 ダート1200m 重")).toMatchObject({ venue: "船橋", distance: 1200, raceClass: "2歳", going: "重" });
  });

  it("「重賞」の「重」を馬場状態と取り違えない", () => {
    expect(parseRaceLine("大井 重賞 1800").going).toBeUndefined();
  });
});

describe("applyRaceLine / nextRace", () => {
  const blank: Race = { name: "", venue: "", surface: "ダ", distance: 0, horses: [], date: "2026-10-15" };
  it("空の項目だけ埋めることもできる", () => {
    const r = applyRaceLine({ ...blank, venue: "浦和" }, parseRaceLine("川崎 5R ダ1400"), true);
    expect(r).toMatchObject({ venue: "浦和", distance: 1400, name: "川崎5R" });
  });
  it("同じ日なら競馬場・馬場状態を引き継ぎ、次のRにする", () => {
    const prev: Race = { ...blank, name: "川崎5R", venue: "川崎", distance: 1400, going: "重" };
    expect(nextRace(prev, "2026-10-15")).toMatchObject({ name: "川崎6R", venue: "川崎", going: "重", distance: 0, horses: [] });
    expect(nextRace(prev, "2026-10-16")).toMatchObject({ name: "", venue: "" });
  });
});

describe("raceLineInPaste", () => {
  it("競馬場・R・距離がそろった行だけを今回のレースとして拾う", () => {
    expect(raceLineInPaste("2026.09.14 中山11\n芝1800 1:46.5")).toBeUndefined();
    expect(raceLineInPaste("出馬表\n川崎 第5競走 2歳 ダート1400m\n1 アオゾラ")).toMatchObject({ venue: "川崎", raceNo: 5, distance: 1400, raceClass: "2歳" });
  });
});

describe("名古屋の組分けのクラス", () => {
  it("C12組 を C1 と読まない", () => {
    expect(parseRaceLine("名古屋 5R ダ1500 C12組").raceClass).toBe("C12組");
  });
});
