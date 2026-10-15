import { describe, expect, it } from "vitest";
import { boardPicks, effectOf } from "./picks";
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

  it("穴の型が消しの型と同じか多い馬は、総合が最下位でも消しにしない", () => {
    const signals = new Map<number, Signal[]>([
      [9, [s("ana", "goodLoss"), s("ana", "better"), s("keshi", "worse")]],
      [8, [s("ana", "goodLoss"), s("keshi", "worse")]],
      [7, [s("keshi", "worse"), s("keshi", "bigLosses"), s("ana", "better")]],
    ]);
    const p = boardPicks(ranked, signals);
    const keshi = p.keshi.map((x) => x.number);
    expect(keshi).not.toContain(9);
    expect(keshi).not.toContain(8);
    expect(keshi[0]).toBe(7); // 消しの型の方が多い馬は消し
    expect(p.ana.map((x) => x.number)).toContain(9);
  });
});

describe("軸の型", () => {
  it("軸の型が多い馬を軸にし、足りなければ総合順位で補う", () => {
    const signals = new Map<number, Signal[]>([
      [4, [s("axis", "stableForm"), s("axis", "classProven")]],
      [2, [s("axis", "topTraining"), s("keshi", "worse")]], // 消しの型があれば軸にしない
    ]);
    const p = boardPicks(ranked, signals);
    expect(p.axis.map((x) => [x.number, x.filler])).toEqual([
      [4, undefined],
      [1, true],
    ]);
  });

  it("総合5位以下の馬は軸の型があっても軸にしない。rank モードは総合順位だけ", () => {
    const signals = new Map<number, Signal[]>([
      [6, [s("axis", "stableForm"), s("axis", "classProven"), s("axis", "courseProven")]],
      [3, [s("axis", "topTraining")]],
    ]);
    expect(boardPicks(ranked, signals).axis.map((x) => x.number)).toEqual([3, 1]);
    expect(boardPicks(ranked, signals, undefined, "rank").axis.map((x) => [x.number, x.filler])).toEqual([
      [1, undefined],
      [2, undefined],
    ]);
  });

  it("軸の型が消しの型と同じか多い馬は消しにしない", () => {
    const signals = new Map<number, Signal[]>([
      [1, [s("axis", "stableForm")]],
      [2, [s("axis", "stableForm")]],
      [9, [s("axis", "courseProven"), s("keshi", "worse")]],
    ]);
    expect(boardPicks(ranked, signals).keshi.map((x) => x.number)).not.toContain(9);
  });
});

describe("型の効き目で候補を選び直す", () => {
  it("効果の薄い型は数えず、実績のある型を優先する", () => {
    const signals = new Map<number, Signal[]>([
      [5, [s("ana", "goodLoss"), s("ana", "better")]], // どちらも効果薄
      [7, [s("ana", "loneLeader")]], // 実績あり
      [8, [s("ana", "secondStart")]],
      [3, [s("keshi", "bigLosses")]], // 効果薄の消しの型 → 軸候補に戻る
    ]);
    const effect = (key: string) =>
      key === "goodLoss" || key === "better" || key === "bigLosses" ? "weak" : key === "loneLeader" ? "proven" : "normal";
    const p = boardPicks(ranked, signals, effect);
    expect(p.axis.map((x) => x.number)).toEqual([1, 2]);
    expect(p.ana.map((x) => x.number)).toEqual([7, 8]);
  });

  it("効き目は出走馬全体の3着内率と比べて決める (10頭未満はふつう)", () => {
    const stat = (kind: Signal["kind"], count: number, top3: number) => ({ key: "k", label: "k", kind, count, top3, wins: 0, oddsCount: 0 });
    expect(effectOf(stat("ana", 20, 10), 0.3)).toBe("proven"); // 50% は 30% の1.67倍
    expect(effectOf(stat("ana", 20, 5), 0.3)).toBe("weak"); // 25%
    expect(effectOf(stat("keshi", 20, 2), 0.3)).toBe("proven"); // 10% は 0.33倍
    expect(effectOf(stat("keshi", 20, 7), 0.3)).toBe("weak"); // 35%
    expect(effectOf(stat("ana", 9, 9), 0.3)).toBe("normal");
  });
});
