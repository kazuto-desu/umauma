import { describe, expect, it } from "vitest";
import { conditionTags, intervalOf, pastDate } from "./conditions";
import type { Horse, Race } from "./types";

const race: Race = { name: "", venue: "川崎", surface: "ダ", distance: 1400, date: "2026-10-14", raceClass: "B2", horses: [] };
const horse = (over: Partial<Horse>, last: Horse["pastRaces"][number]): Horse => ({
  number: 1, frame: 1, name: "H", pastRaces: [last], ...over,
});

describe("conditionTags", () => {
  it("斤量増・昇級・距離延長・間隔・乗り替わりを出す", () => {
    const h = horse(
      { jockey: "鈴木", carried: 56 },
      { passing: [3, 3], date: "9/30", className: "B3", classLevel: 4, distance: 1200, surface: "ダ", jockey: "山田", carried: 54 },
    );
    expect(conditionTags(h, race)).toEqual([
      { text: "斤量増 (+2kg)", tone: "bad" },
      { text: "昇級戦 (前走B3)", tone: "bad" },
      { text: "距離延長 (+200m)" },
      { text: "中1週" },
      { text: "乗り替わり (前走 山田)" },
    ]);
  });

  it("斤量減・降級戦は良い材料、変わらないものは出さない", () => {
    const h = horse(
      { jockey: "山田", carried: 53 },
      { passing: [3, 3], date: "9/16", className: "B1", classLevel: 6, distance: 1400, surface: "ダ", jockey: "山田", carried: 54 },
    );
    expect(conditionTags(h, race)).toEqual([
      { text: "斤量減 (-1kg)", tone: "good" },
      { text: "降級戦 (前走B1)", tone: "good" },
      { text: "中3週" },
    ]);
  });

  it("過去走がなければ初出走", () => {
    expect(conditionTags({ number: 1, frame: 1, name: "H", pastRaces: [] }, race)).toEqual([{ text: "初出走" }]);
  });
});

describe("間隔", () => {
  it("年をまたぐ日付と休み明け", () => {
    expect(pastDate("12/20", "2026-01-10")?.getFullYear()).toBe(2025);
    expect(intervalOf({ passing: [], date: "6/1" }, "2026-10-14")).toEqual({ text: "休み明け (4か月)", tone: "bad" });
    expect(intervalOf({ passing: [], date: "10/8" }, "2026-10-14")).toEqual({ text: "連闘" });
  });
});
