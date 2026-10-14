import { describe, expect, it } from "vitest";
import { parsePassingText } from "./notation";
import { DEFAULT_OPTIONS, predict } from "./predict";
import { SAMPLE_RACE } from "./sample";
import { parseWorkouts } from "./training";
import { formOf } from "./form";
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
  it("調子の上昇を重く見て、位置取りが少し劣る馬でも上にする", () => {
    const flat = "9/20 良 一杯\n67.0 52.0 38.5\n10/8 良 一杯\n67.0 52.0 38.5";
    const rising = "9/20 良 一杯\n69.0 54.0 40.5\n10/8 良 一杯\n66.0 51.0 37.5";
    const horses = [1, 2, 3, 4, 5, 6].map((n) => ({
      number: n,
      frame: n,
      name: `H${n}`,
      pastRaces: parsePassingText(n === 6 ? "4-4/10 4-4/10" : `${n}-${n}/10 ${n}-${n}/10`),
      workouts: parseWorkouts(n === 6 ? rising : flat),
    }));
    const race = { name: "", venue: "", surface: "ダ" as const, distance: 1400, horses };
    const v = verdict(predict(race, { ...DEFAULT_OPTIONS, useTraining: false }), horses);
    expect(v[0].number).toBe(6);
    expect(v[0].reasons).toContain("調子上昇");
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

describe("formOf", () => {
  it("近走の着順とタイム差から 0 (良い) 〜 1 (悪い) を出し、新しいレースを重く見る", () => {
    const win = { passing: [1, 1], fieldSize: 10, finish: 1, margin: 0 };
    const last = { passing: [9, 9], fieldSize: 10, finish: 10, margin: 3.5 };
    expect(formOf([win])).toBe(0);
    expect(formOf([last])).toBe(1);
    expect(formOf([win, last])!).toBeLessThan(formOf([last, win])!);
    expect(formOf([{ passing: [3, 3] }])).toBeUndefined();
  });

  it("展開・調教が同じなら、近走の成績が良い馬を上にする", () => {
    const horses = [1, 2, 3, 4].map((n) => ({
      number: n,
      frame: n,
      name: `H${n}`,
      pastRaces: [{ passing: [5, 5], fieldSize: 10, finish: n === 3 ? 1 : 8, margin: n === 3 ? 0 : 2.5 }],
    }));
    const race = { name: "", venue: "", surface: "ダ" as const, distance: 1400, horses };
    const v = verdict(predict(race, DEFAULT_OPTIONS), horses);
    expect(v[0].number).toBe(3);
    expect(v[0].reasons).toContain("前走1着");
  });
});

describe("オッズ込みの結論", () => {
  const horses = [1, 2, 3, 4, 5, 6].map((n) => ({
    number: n,
    frame: n,
    name: `H${n}`,
    pastRaces: parsePassingText(`${n}-${n}/10 ${n}-${n}/10`),
    odds: [30, 20, 15, 1.5, 3, 50][n - 1],
  }));
  const race = { name: "", venue: "", surface: "ダ" as const, distance: 1400, horses };

  it("オッズなしの印とは別に、人気を加えた印を付け、印より人気のない馬に妙味ありと出す", () => {
    const p = predict(race, DEFAULT_OPTIONS);
    const before = verdict(p, horses);
    const after = verdict(p, horses, undefined, true);
    expect(before[0].number).toBe(1);
    expect(before[0].odds).toBeUndefined();
    expect(after[0]).toMatchObject({ odds: expect.any(Number), popularity: expect.any(Number) });
    expect(after.findIndex((r) => r.number === 4)).toBeLessThan(before.findIndex((r) => r.number === 4));
    expect(after.find((r) => r.number === 1)!.reasons[0]).toMatch(/^妙味あり \(\d番人気\)$/);
  });

  it("オッズを入れたレースでは、オッズなし・オッズ込みの成績と単勝回収率を数える", () => {
    const r = { ...race, result: { firstCorner: "", finalCorner: "", finish: "1,2,3" } };
    const rec = verdictRecord([r], DEFAULT_OPTIONS);
    expect(rec.odds!.before).toMatchObject({ races: 1 });
    expect(rec.odds!.after.races).toBe(1);
    if (rec.odds!.before.honmeiWin) expect(rec.odds!.before.honmeiReturn).toBe(3000);
  });
});
