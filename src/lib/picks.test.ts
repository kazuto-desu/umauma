import { describe, expect, it } from "vitest";
import { boardPicks } from "./picks";
import type { Signal } from "./signals";
import type { RankedHorse } from "./verdict";

const ranked: RankedHorse[] = Array.from({ length: 9 }, (_, k) => ({ number: k + 1, name: `H${k + 1}`, total: k / 10, reasons: [] }));
const s = (kind: Signal["kind"], key: string): Signal => ({ kind, key, label: key, reason: "r" });

describe("boardPicks", () => {
  it("軸2頭・穴2頭・消しは出走頭数の3分の1", () => {
    const signals = new Map<number, Signal[]>([
      [1, [s("keshi", "badState")]], // 総合1位でも消しの型があれば軸にしない
      [5, [s("ana", "goodLoss"), s("ana", "better")]],
      [7, [s("ana", "loneLeader")]],
      [4, [s("keshi", "worse"), s("keshi", "bigLosses")]],
    ]);
    const p = boardPicks(ranked, signals);
    expect(p.axis.map((x) => x.number)).toEqual([2, 3]);
    expect(p.keshi.map((x) => x.number)).toEqual([4, 1, 9]); // 消しの型が多い順 → 総合が下の順
    expect(p.ana.map((x) => x.number)).toEqual([5, 7]);
  });

  it("穴の型が足りなければ総合順位で補い「次点」とする", () => {
    const p = boardPicks(ranked.slice(0, 6), new Map());
    expect(p.axis.map((x) => x.number)).toEqual([1, 2]);
    expect(p.keshi.map((x) => x.number)).toEqual([6, 5]);
    expect(p.ana.map((x) => [x.number, x.filler])).toEqual([
      [3, true],
      [4, true],
    ]);
  });
});
