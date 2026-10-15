import { describe, expect, it } from "vitest";
import { predict } from "./predict";
import { signalStats, signalsOf } from "./signals";
import type { Horse, Race } from "./types";

const base = (n: number, over: Partial<Horse> = {}): Horse => ({
  number: n,
  frame: n,
  name: `H${n}`,
  pastRaces: [{ passing: [5, 5], fieldSize: 10, finish: 5, margin: 1.0, distance: 1400, surface: "ダ", date: "9/20" }],
  ...over,
});
const race = (horses: Horse[]): Race => ({
  id: "r", name: "", venue: "川崎", surface: "ダ", distance: 1400, date: "2026-10-14", raceClass: "B2", horses,
});
const keys = (r: Race, n: number) => (signalsOf(r, predict(r)).get(n) ?? []).map((s) => s.key);

describe("signalsOf", () => {
  it("前走は負けたが着差が小さい・降級・斤量減を穴の型として拾う", () => {
    const h = base(1, {
      carried: 53,
      pastRaces: [{ passing: [6, 6], fieldSize: 10, finish: 6, margin: 0.3, className: "B1", classLevel: 6, carried: 55, date: "9/20" }],
    });
    const k = keys(race([h, base(2), base(3), base(4)]), 1);
    expect(k).toContain("goodLoss");
    expect(k).toContain("better");
  });

  it("昇級と斤量増が重なる・大敗続きを消しの型として拾う", () => {
    const h = base(1, {
      carried: 56,
      pastRaces: [
        { passing: [8, 8], fieldSize: 10, finish: 9, margin: 2.5, className: "B3", classLevel: 4, carried: 54, date: "9/20" },
        { passing: [8, 8], fieldSize: 10, finish: 10, margin: 3.1, date: "8/30" },
      ],
    });
    const k = keys(race([h, base(2), base(3), base(4)]), 1);
    expect(k).toContain("worse");
    expect(k).toContain("bigLosses");
  });

  it("叩き2戦目: 休み明けを1回使った次", () => {
    const h = base(1, {
      pastRaces: [
        { passing: [5, 5], fieldSize: 10, finish: 7, margin: 1.2, date: "9/23" },
        { passing: [5, 5], fieldSize: 10, finish: 3, margin: 0.2, date: "4/10" },
      ],
    });
    expect(keys(race([h, base(2), base(3)]), 1)).toContain("secondStart");
  });
});

describe("signalStats", () => {
  it("型ごとに当てはまった馬の3着内率と単勝回収率を数える", () => {
    const winner = base(1, {
      odds: 8.0,
      pastRaces: [{ passing: [6, 6], fieldSize: 10, finish: 6, margin: 0.3, date: "9/20" }],
    });
    const r = { ...race([winner, base(2), base(3), base(4)]), result: { firstCorner: "", finalCorner: "", finish: "1,2,3,4" } };
    const { races, stats } = signalStats([r, { ...r, id: "x", venue: "大井" }], {
      gateWeight: 1,
      recentRaces: 5,
    }, "川崎");
    expect(races).toBe(1);
    expect(stats.find((s) => s.key === "goodLoss")).toMatchObject({ count: 1, top3: 1, wins: 1, returnRate: 800 });
  });
});
