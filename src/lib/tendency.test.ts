import { describe, expect, it } from "vitest";
import { collectRuns, dayTendencies, filterRuns, styleBucket, tendencyOf, todaysRaces } from "./tendency";
import type { Horse, PastRace, Race } from "./types";

const run = (date: string, finish: number, first: number, over: Partial<PastRace> = {}): PastRace => ({
  date, finish, fieldSize: 10, passing: [first, first], venue: "川崎", surface: "ダ", distance: 1400, ...over,
});
const horse = (name: string, number: number, pastRaces: PastRace[]): Horse => ({ number, frame: number, name, pastRaces });

describe("collectRuns", () => {
  it("馬柱の過去走と結果の両方から走りを集め、同じ馬の同じ日は1つにする", () => {
    const card: Race = {
      id: "c", name: "川崎1R", venue: "川崎", surface: "ダ", distance: 1400, date: "2026-10-16",
      horses: [horse("A", 1, [run("10/01", 1, 1, { gate: 2 }), run("9/20", 5, 8)]), horse("B", 2, [run("10/01", 4, 6)])],
    };
    const result: Race = {
      id: "r", name: "川崎5R", venue: "川崎", surface: "ダ", distance: 1400, date: "2026-10-01",
      horses: [horse("A", 1, []), horse("C", 2, []), horse("D", 3, []), horse("E", 4, [])],
      result: { firstCorner: "1,2,3,4", finalCorner: "1,2,3,4", finish: "1,3,2,4" },
    };
    const runs = collectRuns([card, result]);
    // A の 10/01 は結果の方だけ数える
    expect(runs.filter((r) => r.horse === "A" && r.date === "2026-10-01")).toHaveLength(1);
    expect(runs.find((r) => r.horse === "A" && r.date === "2026-10-01")!.source).toBe("result");
    expect(runs.find((r) => r.horse === "A" && r.date === "2026-09-20")).toMatchObject({ finish: 5, firstRank: 8 });
    expect(runs.find((r) => r.horse === "B")).toMatchObject({ source: "history", finish: 4 });
  });
});

describe("tendencyOf", () => {
  it("脚質別 (1角の位置) と枠別の3着内率を数える", () => {
    const horses = [
      horse("A", 1, [run("10/01", 1, 1, { gate: 1 })]),
      horse("B", 2, [run("10/01", 2, 2, { gate: 9 })]),
      horse("C", 3, [run("10/01", 8, 9, { gate: 5 })]),
      horse("D", 4, [run("10/01", 9, 10, { gate: 10 })]),
    ];
    const runs = collectRuns([{ id: "x", name: "", venue: "川崎", surface: "ダ", distance: 1400, date: "2026-10-16", horses }]);
    expect(styleBucket(runs.find((r) => r.horse === "A")!)).toBe("逃げ");
    const t = tendencyOf(filterRuns(runs, { venue: "川崎", distance: 1400 }));
    expect(t.styles.find((s) => s.label === "逃げ")).toMatchObject({ count: 1, top3: 1, wins: 1 });
    expect(t.styles.find((s) => s.label === "追込")).toMatchObject({ count: 2, top3: 0 });
    expect(t.gates.find((g) => g.label === "内")).toMatchObject({ count: 1, top3: 1 });
    expect(t.base).toBe(0.5);
  });
});

describe("dayTendencies", () => {
  it("3着以内の馬が前にいた日を「前残り」にする", () => {
    // 10/01 は3着以内がみな4角で先頭近く、9/20 は後ろから
    const mk = (date: string, front: boolean) =>
      [1, 2, 3, 4, 5, 6].map((k) => horse(`${date}-${k}`, k, [run(date, k, front ? k : 11 - k, { passing: front ? [k, k] : [11 - k, 11 - k] })]));
    const card: Race = { id: "c", name: "", venue: "川崎", surface: "ダ", distance: 1400, date: "2026-10-16", horses: [...mk("10/01", true), ...mk("9/20", false), ...mk("9/10", true), ...mk("9/01", false)] };
    const days = dayTendencies(collectRuns([card]), "川崎");
    expect(days.map((d) => d.date)).toEqual(["2026-10-01", "2026-09-20", "2026-09-10", "2026-09-01"]);
    expect(days[0].labels).toContain("前残り");
    expect(days[1].labels).toContain("差し届く");
  });
});

describe("todaysRaces", () => {
  it("その日・その競馬場の結果ごとに上位3頭の4角の位置を出す", () => {
    const r: Race = {
      id: "r", name: "川崎5R", venue: "川崎", surface: "ダ", distance: 1400, date: "2026-10-16",
      horses: [1, 2, 3, 4].map((n) => horse(`H${n}`, n, [])),
      result: { firstCorner: "4,3,2,1", finalCorner: "4,3,2,1", finish: "1,4,2,3" },
    };
    const s = todaysRaces([r], "2026-10-16", "川崎");
    expect(s[0].top.map((t) => [t.number, t.finalRank])).toEqual([[1, 4], [4, 1], [2, 3]]);
  });
});

describe("競馬場ごとに分ける", () => {
  it("ほかの競馬場の走りはコース傾向・開催日の傾向に混ざらない", () => {
    const card: Race = {
      id: "c", name: "", venue: "川崎", surface: "ダ", distance: 1400, date: "2026-10-16",
      horses: [
        horse("A", 1, [run("10/01", 1, 1), run("9/20", 1, 1, { venue: "大井" })]),
        horse("B", 2, [run("10/01", 9, 9), run("9/20", 2, 2, { venue: "大井" })]),
      ],
    };
    const runs = collectRuns([card]);
    expect(tendencyOf(filterRuns(runs, { venue: "川崎", distance: 1400 })).runs).toBe(2);
    expect(tendencyOf(filterRuns(runs, { venue: "大井", distance: 1400 })).runs).toBe(2);
    expect(dayTendencies(runs, "川崎").every((d) => d.venue === "川崎" && d.date === "2026-10-01")).toBe(true);
  });
});
