import { describe, expect, it } from "vitest";
import { MIN_AXIS_RACES, bestAxisMode, pickRecord } from "./pickRecord";
import { DEFAULT_OPTIONS } from "./predict";
import type { Horse, Race } from "./types";

const horse = (n: number, finish: number): Horse => ({
  number: n,
  frame: n,
  name: `H${n}`,
  pastRaces: [{ passing: [n, n], fieldSize: 8, finish, margin: finish === 1 ? 0 : finish * 0.3, date: "9/20" }],
});
const race = (id: string, finish: string): Race => ({
  id, name: "", venue: "川崎", surface: "ダ", distance: 1400, date: "2026-10-14",
  horses: [1, 2, 3, 4, 5, 6].map((n) => horse(n, n)),
  result: { firstCorner: "", finalCorner: "", finish },
});

describe("pickRecord", () => {
  it("候補に選ばれた馬の3着内を数え、着順のないレースは数えない", () => {
    const rec = pickRecord([race("a", "1,2,3,4,5,6"), { ...race("b", ""), result: undefined }], DEFAULT_OPTIONS);
    expect(rec.races).toBe(1);
    expect(rec.all).toEqual({ count: 6, top3: 3, wins: 1 });
    expect(rec.axis.rank.count).toBe(2);
    expect(rec.keshi.count).toBe(2);
  });

  it("レースが少ないうちは型優先、たまったら3着内率の高い方", () => {
    const t = (count: number, top3: number) => ({ count, top3, wins: 0 });
    const base = { ana: t(0, 0), keshi: t(0, 0), all: t(0, 0), materials: {} as never };
    expect(bestAxisMode({ ...base, races: 3, axis: { types: t(6, 1), rank: t(6, 5) } })).toBe("types");
    expect(bestAxisMode({ ...base, races: MIN_AXIS_RACES, axis: { types: t(30, 10), rank: t(30, 18) } })).toBe("rank");
    expect(bestAxisMode({ ...base, races: MIN_AXIS_RACES, axis: { types: t(30, 18), rank: t(30, 18) } })).toBe("types");
  });
});
