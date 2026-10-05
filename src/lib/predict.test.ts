import { describe, expect, it } from "vitest";
import { frameOf } from "./frame";
import { parsePassingText } from "./notation";
import { predict, toNotation } from "./predict";
import { SAMPLE_RACE } from "./sample";

describe("frameOf", () => {
  it("8頭以下は馬番=枠番", () => {
    expect([1, 5, 8].map((n) => frameOf(n, 8))).toEqual([1, 5, 8]);
  });
  it("16頭は2頭ずつ", () => {
    expect([1, 2, 3, 15, 16].map((n) => frameOf(n, 16))).toEqual([1, 1, 2, 8, 8]);
  });
  it("18頭は7,8枠が3頭", () => {
    expect([12, 13, 15, 16, 18].map((n) => frameOf(n, 18))).toEqual([6, 7, 7, 8, 8]);
  });
  it("10頭は7,8枠が2頭", () => {
    expect([6, 7, 8, 9, 10].map((n) => frameOf(n, 10))).toEqual([6, 7, 7, 8, 8]);
  });
});

describe("parsePassingText", () => {
  it("通過順と頭数を読む", () => {
    expect(parsePassingText("3-3-2-1/16 ５-４")).toEqual([
      { passing: [3, 3, 2, 1], fieldSize: 16 },
      { passing: [5, 4], fieldSize: undefined },
    ]);
  });
});

describe("predict", () => {
  const p = predict(SAMPLE_RACE);
  it("逃げ馬が1コーナーで先頭付近、追込馬が後方", () => {
    const pos = (n: number) => p.firstCorner.find((x) => x.number === n)!.x;
    expect(pos(3)).toBeLessThan(pos(5));
    expect(pos(8)).toBeLessThan(pos(11));
  });
  it("マクリ馬は最終コーナーで位置を上げる", () => {
    const a = p.analyses.find((x) => x.number === 13)!;
    expect(a.late).toBeLessThan(a.early);
  });
  it("同じレーンで重ならない", () => {
    for (const set of [p.firstCorner, p.finalCorner]) {
      for (const a of set)
        for (const b of set)
          if (a !== b && a.lane === b.lane) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(1.1);
    }
  });
  it("全頭が通過順表記に出る", () => {
    const nums = toNotation(p.firstCorner).match(/\d+/g)!.map(Number).sort((a, b) => a - b);
    expect(nums).toEqual(SAMPLE_RACE.horses.map((h) => h.number));
  });
});

describe("コース・過去走の補正", () => {
  const sameHorses = Array.from({ length: 16 }, (_, i) => ({
    number: i + 1,
    frame: frameOf(i + 1, 16),
    name: `H${i + 1}`,
    pastRaces: parsePassingText("5-5-5-5/16 5-5-5/16"),
  }));
  const race = (venue: string, distance: number) => ({ name: "", venue, surface: "芝" as const, distance, horses: sameHorses });
  const gap = (venue: string, distance: number) => {
    const a = predict(race(venue, distance)).analyses;
    return a[15].early - a[0].early; // 大外と最内の1コーナー位置の差
  };

  it("最初のコーナーが近いコースほど外枠の不利が大きい", () => {
    expect(gap("東京", 2000)).toBeGreaterThan(gap("新潟", 1800));
  });

  it("直線コースは外枠が有利", () => {
    expect(gap("新潟", 1000)).toBeLessThan(0);
  });

  it("芝スタートのダートは外枠の不利が小さい", () => {
    const dirt = (distance: number) => {
      const a = predict({ ...race("東京", distance), surface: "ダ" }).analyses;
      return a[15].early - a[0].early;
    };
    expect(dirt(1600)).toBeLessThan(dirt(2100));
  });

  it("距離延長の馬は前に行きやすい", () => {
    const horse = (dist: number) => ({ number: 1, frame: 1, name: "A", pastRaces: [{ passing: [8, 8], fieldSize: 16, distance: dist }] });
    const r = (dist: number) => predict({ name: "", venue: "", surface: "芝", distance: 2000, horses: [horse(dist), { ...horse(2000), number: 2 }] }).analyses[0].early;
    expect(r(1200)).toBeLessThan(r(2400)); // 1200→2000 の延長馬のほうが前 (値が小さい)
  });

  it("取消の馬は隊列に入らない", () => {
    const p = predict({ ...race("東京", 2000), horses: sameHorses.map((h, i) => ({ ...h, scratched: i === 0 })) });
    expect(p.firstCorner.map((x) => x.number)).not.toContain(1);
    expect(p.firstCorner).toHaveLength(15);
  });
});
