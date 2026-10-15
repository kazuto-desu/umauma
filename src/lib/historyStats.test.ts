import { describe, expect, it } from "vitest";
import { historyStats, horseHistories, mergeStats } from "./historyStats";
import type { Horse, PastRace, Race } from "./types";

const run = (date: string, finish: number, over: Partial<PastRace> = {}): PastRace => ({
  date, finish, passing: [3, 3], fieldSize: 10, venue: "川崎", distance: 1400, margin: finish === 1 ? 0 : finish * 0.3, ...over,
});
const horse = (name: string, pastRaces: PastRace[]): Horse => ({ number: 1, frame: 1, name, pastRaces });
const race = (date: string, horses: Horse[]): Race => ({ id: date, name: "", venue: "川崎", surface: "ダ", distance: 1400, date, horses });

describe("horseHistories", () => {
  it("同じ馬の過去走を別のレースからつなげ、同じ日は1つにする", () => {
    const h = horseHistories([
      race("2026-10-01", [horse("A", [run("9/20", 2), run("9/01", 5)])]),
      race("2026-10-20", [horse("A", [run("10/01", 1), run("9/20", 2)])]),
    ]);
    expect(h.get("A")!.map((r) => r.date)).toEqual(["2026-10-01", "2026-09-20", "2026-09-01"]);
  });
});

describe("historyStats", () => {
  it("過去走を「そのときのレース」とみなして型の成績を数える", () => {
    // 10/01 は直前2走が2着・3着 (好走安定・コース実績) で1着。9/20 は直前1走しかない
    const r = race("2026-10-20", [horse("A", [run("10/01", 1), run("9/20", 2), run("9/01", 3)])]);
    const s = historyStats([r]);
    expect(s.samples).toBe(2);
    expect(s.top3).toBe(2);
    const stable = s.stats.find((x) => x.key === "stableForm")!;
    expect(stable).toMatchObject({ count: 1, top3: 1, wins: 1 });
    expect(s.stats.find((x) => x.key === "courseProven")!.count).toBe(2);
  });

  it("競馬場を指定するとその競馬場の過去走だけ", () => {
    const r = race("2026-10-20", [horse("A", [run("10/01", 1, { venue: "大井" }), run("9/20", 2), run("9/01", 3)])]);
    expect(historyStats([r], "川崎").samples).toBe(1);
    expect(historyStats([r], "大井").samples).toBe(1);
  });
});

describe("mergeStats", () => {
  it("同じ型の頭数を足す", () => {
    const base = { key: "stableForm", label: "好走安定", kind: "axis" as const, count: 3, top3: 1, wins: 0, oddsCount: 2 };
    expect(mergeStats([base], [{ ...base, count: 10, top3: 5, wins: 2, oddsCount: 0 }])[0]).toMatchObject({ count: 13, top3: 6, wins: 2, oddsCount: 2 });
  });
});
