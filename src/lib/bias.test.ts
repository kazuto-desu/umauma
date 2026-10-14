import { describe, expect, it } from "vitest";
import { trackBias } from "./bias";
import { DEFAULT_OPTIONS, predict } from "./predict";
import { parsePassingText } from "./notation";
import type { Race } from "./types";

const horses = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, frame: i + 1, name: `H${i + 1}`, pastRaces: [] }));
const race = (id: string, date: string, finalCorner: string, finish: string): Race => ({
  id, name: id, venue: "川崎", surface: "ダ", distance: 1400, date, horses,
  result: { firstCorner: finalCorner, finalCorner, finish },
});
const FRONT = "1,2,3,4,5,6,7,8,9,10";

describe("trackBias", () => {
  it("同じ日のレースで前にいた内枠の馬ばかり来ていれば、前残り・内有利", () => {
    const today: Race = { ...race("now", "2026-10-14", "", ""), result: undefined };
    const saved = [race("a", "2026-10-14", FRONT, "1,2,3"), race("b", "2026-10-14", FRONT, "2,1,3"), race("c", "2026-10-14", FRONT, "1,3,2")];
    const b = trackBias(saved, today)!;
    expect(b.races).toBe(3);
    expect(b.front).toBeGreaterThan(0.1);
    expect(b.inner).toBeGreaterThan(0.1);
    expect(b.labels).toEqual(["前残り", "内有利"]);
  });

  it("後ろの外枠ばかり来ていれば、差しが届く・外有利", () => {
    const today: Race = { ...race("now", "2026-10-14", "", ""), result: undefined };
    const b = trackBias([race("a", "2026-10-14", FRONT, "10,9,8"), race("b", "2026-10-14", FRONT, "9,10,8")], today)!;
    expect(b.labels).toEqual(["差しが届く", "外有利"]);
  });

  it("別の日・別の競馬場のレースは使わない", () => {
    const today: Race = { ...race("now", "2026-10-14", "", ""), result: undefined };
    expect(trackBias([race("a", "2026-10-13", FRONT, "1,2,3"), { ...race("b", "2026-10-14", FRONT, "1,2,3"), venue: "大井" }], today)).toBeUndefined();
  });

  it("前残りの傾向を入れると、ゴール前で前にいる馬が有利になる", () => {
    const field = [
      { number: 1, frame: 1, name: "ニゲ", pastRaces: parsePassingText("1-1/10 1-1/10") },
      { number: 2, frame: 2, name: "オイコミ", pastRaces: parsePassingText("9-9/10 9-9/10") },
    ];
    const r = { name: "", venue: "", surface: "ダ" as const, distance: 1400, horses: field };
    const gap = (o: typeof DEFAULT_OPTIONS) => {
      const a = predict(r, o).analyses;
      return a[1].goal! - a[0].goal!;
    };
    expect(gap({ ...DEFAULT_OPTIONS, bias: { front: 0.15, inner: 0 } })).toBeGreaterThan(gap(DEFAULT_OPTIONS));
  });
});
