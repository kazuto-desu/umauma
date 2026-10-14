import { describe, expect, it } from "vitest";
import { commentShift, parseComments, readComment } from "./comment";
import { DEFAULT_OPTIONS, predict } from "./predict";
import { parsePassingText } from "./notation";

// 競馬ブックの厩舎コメントの形 (内容は架空)
const TEXT = [
  "1", "1\tアオゾラ", "○アオゾラ【山田師】状態はいいのでここも思い切って行くのみ。",
  "2", "2\tユウヒ", "○ユウヒ【担当厩務員】鼻出血からの再検明け。今回は控えて脚を溜める形で。",
  "3", "3\tホシゾラ", "○ホシゾラ【鈴木師】前走はスタートで躓いた。調子自体は今回も良好。",
].join("\n");

describe("parseComments", () => {
  it("枠・馬番・馬名・話した人・コメントに分ける", () => {
    expect(parseComments(TEXT)).toEqual([
      { frame: 1, number: 1, name: "アオゾラ", speaker: "山田師", comment: "状態はいいのでここも思い切って行くのみ。" },
      { frame: 2, number: 2, name: "ユウヒ", speaker: "担当厩務員", comment: "鼻出血からの再検明け。今回は控えて脚を溜める形で。" },
      { frame: 3, number: 3, name: "ホシゾラ", speaker: "鈴木師", comment: "前走はスタートで躓いた。調子自体は今回も良好。" },
    ]);
  });
});

describe("readComment", () => {
  it("作戦・スタートの不安・状態を読む", () => {
    expect(readComment("状態はいいのでここも思い切って行くのみ。")).toMatchObject({ tactic: "前", startRisk: false, mood: 0.5 });
    const b = readComment("鼻出血からの再検明け。今回は控えて脚を溜める形で。");
    expect(b.tactic).toBe("控え");
    expect(b.mood).toBeLessThan(0);
    expect(b.tags).toEqual(["控える意向", "体調面の不安", "休み明け"]);
    expect(readComment("前走はスタートで躓いた。調子自体は今回も良好。")).toMatchObject({ startRisk: true, tags: ["スタートに不安", "状態良好"] });
  });

  it("「悪くない」は割り引き材料にせず、「スタート勘が良い」は不安にしない", () => {
    expect(readComment("デキ自体は悪くないので仕切り直し。").mood).toBeGreaterThan(0);
    expect(readComment("スタート勘も最近は良いし、チャンスはある。").startRisk).toBe(false);
  });
});

describe("厩舎コメントを予想に反映", () => {
  it("前に行く意向の馬は1コーナーの位置を前に、控える馬は後ろにする", () => {
    const horse = (n: number, comment?: string) => ({
      number: n, frame: n, name: `H${n}`, pastRaces: parsePassingText("5-5/10 5-5/10"), ...(comment ? { stableComment: comment } : {}),
    });
    expect(commentShift(horse(1, "ハナを切りたい"))).toBeLessThan(0);
    expect(commentShift(horse(1, "控えて溜める"))).toBeGreaterThan(0);
    const race = { name: "", venue: "", surface: "ダ" as const, distance: 1400, horses: [horse(1, "控えて溜める"), horse(2, "ハナを切りたい")] };
    const [a, b] = predict(race, DEFAULT_OPTIONS).analyses;
    expect(b.early).toBeLessThan(a.early);
    const off = predict(race, { ...DEFAULT_OPTIONS, useComments: false }).analyses;
    expect(off[1].early).toBeGreaterThan(b.early);
  });
});
