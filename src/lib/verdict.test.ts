import { describe, expect, it } from "vitest";
import { parsePassingText } from "./notation";
import { DEFAULT_OPTIONS, predict } from "./predict";
import { SAMPLE_RACE } from "./sample";
import { parseWorkouts } from "./training";
import { verdict, verdictRecord } from "./verdict";

describe("verdict", () => {
  it("5頭に ◎○▲△△ を付け、理由を添える", () => {
    const v = verdict(predict(SAMPLE_RACE), SAMPLE_RACE.horses);
    expect(v.map((x) => x.mark)).toEqual(["◎", "○", "▲", "△", "△"]);
    expect(new Set(v.map((x) => x.number)).size).toBe(5);
    expect(v[0].reasons[0]).toMatch(/^ゴール前\d+番手の想定$/);
  });

  it("展開が同じなら、調教の良い馬を上にする", () => {
    const fast = "9/20 良 一杯\n68.0 53.0 39.5\n10/8 良 一杯\n66.0 51.0 37.5";
    const slow = "9/20 良 一杯\n66.0 51.0 37.5\n10/8 良 一杯\n69.0 54.0 40.5";
    const horses = [1, 2, 3, 4].map((n) => ({
      number: n,
      frame: n,
      name: `H${n}`,
      pastRaces: parsePassingText("5-5/10 5-5/10"),
      workouts: parseWorkouts(n === 4 ? fast : slow),
    }));
    const race = { name: "", venue: "", surface: "ダ" as const, distance: 1400, horses };
    const v = verdict(predict(race, { ...DEFAULT_OPTIONS, useTraining: false }), horses);
    expect(v[0].number).toBe(4);
    expect(v[0].reasons).toContain("調教ラップ上位");
  });
});

describe("verdictRecord", () => {
  it("着順のあるレースで ◎ の成績を数える", () => {
    const v = verdict(predict(SAMPLE_RACE), SAMPLE_RACE.horses);
    const winRace = { ...SAMPLE_RACE, result: { firstCorner: "", finalCorner: "", finish: `${v[0].number},${v[1].number},${v[2].number}` } };
    const loseRace = { ...SAMPLE_RACE, result: { firstCorner: "", finalCorner: "", finish: "14,13,12" } };
    const r = verdictRecord([winRace, loseRace, SAMPLE_RACE], DEFAULT_OPTIONS);
    expect(r.races).toBe(2);
    expect(r.honmeiWin).toBe(1);
    expect(r.honmeiTop3).toBe(1);
    expect(r.marksInTop3).toBe(3);
    expect(r.randomTop3).toBeCloseTo(0.4, 1);
  });
});
