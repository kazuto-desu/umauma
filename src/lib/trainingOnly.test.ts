import { describe, expect, it } from "vitest";
import { importAny } from "./importer";
import { boardPicks } from "./picks";
import { predict } from "./predict";
import { signalsOf } from "./signals";
import { ranking } from "./verdict";

// 架空の馬 (importer.test.ts と同じ調教)
const TRAINING = "1\n1\tアオゾラ\t好調持続\t→\n\t10/8 川崎調教場 良\t一杯\n66.7\t52.0\t39.1\t\n2\n2\tユウヒ\t直線の伸び良\t↑\n\t10/8 川崎調教場 良\t馬なり\n68.0\t53.0\t39.5\t";

describe("調教だけで予想する", () => {
  it("過去走がなくても調教の時計で順位と候補を出し、想定位置は理由に出さない", () => {
    const r = importAny(TRAINING, { name: "", venue: "川崎", surface: "ダ", distance: 1400, horses: [] });
    if ("error" in r) throw new Error(r.error);
    expect(r.race.horses.every((h) => h.pastRaces.length === 0)).toBe(true);
    const prediction = predict(r.race);
    const ranked = ranking(prediction, r.race.horses);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].total).toBeLessThan(ranked[1].total); // 調教の材料で差が付いている
    expect(ranked.flatMap((x) => x.reasons).some((t) => t.includes("ゴール前"))).toBe(false);
    const picks = boardPicks(ranked, signalsOf(r.race, prediction));
    expect(picks.axis.length).toBeGreaterThan(0);
  });
});
