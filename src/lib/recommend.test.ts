import { describe, expect, it } from "vitest";
import { parsePassingText } from "./notation";
import { predict } from "./predict";
import { recommend } from "./recommend";
import { SAMPLE_RACE } from "./sample";

describe("recommend", () => {
  const p = predict(SAMPLE_RACE);
  const r = recommend(p);

  it("前残り・差しをそれぞれ2頭、重ならずに選ぶ", () => {
    expect(r.front).toHaveLength(2);
    expect(r.closer).toHaveLength(2);
    const all = [...r.front, ...r.closer].map((x) => x.number);
    expect(new Set(all).size).toBe(4);
  });

  it("前残りは最終コーナーで前、差しは後ろにいる馬", () => {
    const late = (n: number) => p.analyses.find((a) => a.number === n)!.late;
    for (const f of r.front) expect(late(f.number)).toBeLessThan(0.4);
    for (const c of r.closer) expect(late(c.number)).toBeGreaterThanOrEqual(0.4);
  });

  it("想定の位置の流れを理由に出す", () => {
    expect(r.front[0].reasons[0]).toMatch(/^\d+番手 → 4角\d+番手 → ゴール前\d+番手の想定$/);
  });

  it("頭数が少なければ選べる分だけ", () => {
    const small = predict({
      name: "",
      venue: "",
      surface: "ダ",
      distance: 1400,
      horses: [1, 2].map((n) => ({ number: n, frame: n, name: `H${n}`, pastRaces: parsePassingText("1-1/8") })),
    });
    const s = recommend(small);
    expect(s.front.length + s.closer.length).toBeLessThanOrEqual(2);
  });
});
