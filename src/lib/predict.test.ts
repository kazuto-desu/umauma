import { describe, expect, it } from "vitest";
import { frameOf } from "./frame";
import { parsePassingText } from "./notation";
import { DEFAULT_OPTIONS, predict, toNotation } from "./predict";
import { SAMPLE_RACE } from "./sample";
import { parseWorkouts } from "./training";

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

describe("騎手・馬場・末脚", () => {
  const mk = (n: number, text: string, jockey?: string) => ({
    number: n,
    frame: n,
    name: `H${n}`,
    pastRaces: parsePassingText(text),
    jockey,
  });
  const base = { name: "", venue: "", surface: "芝" as const, distance: 1600 };

  it("積極的な騎手の馬は前に行く", () => {
    const horses = [mk(1, "5-5/10", "騎手A"), mk(2, "5-5/10")];
    const plain = predict({ ...base, horses }).analyses[0].early;
    const eager = predict({ ...base, horses }, { ...DEFAULT_OPTIONS, jockeyNotes: { 騎手A: "積極" } }).analyses[0].early;
    expect(eager).toBeLessThan(plain);
  });

  it("ダートの不良馬場は前の馬に展開が向く", () => {
    const horses = [mk(1, "3-3/10"), mk(2, "5-5/10"), mk(3, "9-9/10")];
    const good = predict({ ...base, surface: "ダ", horses });
    const sloppy = predict({ ...base, surface: "ダ", going: "不良", horses });
    expect(sloppy.analyses[0].late).toBeLessThan(good.analyses[0].late);
    expect(sloppy.courseNotes.join()).toContain("前が残りやすい");
  });

  it("上がり3Fを拾って末脚ランクを付ける", () => {
    expect(parsePassingText("16頭 3-3-2-1 (34.5)")[0].last3f).toBe(34.5);
    const horses = [mk(1, "1-1/10(36.0)"), mk(2, "5-5/10(35.0)"), mk(3, "9-9/10(33.5)"), mk(4, "7-7/10")];
    const a = predict({ ...base, horses }).analyses;
    expect(a.map((x) => x.closing)).toEqual(["C", "B", "S", undefined]);
  });
});

describe("調教の調子", () => {
  const horse = (n: number, workouts: string, trend?: string) => ({
    number: n,
    frame: n,
    name: `H${n}`,
    pastRaces: parsePassingText("4-4/10 4-4/10"),
    workouts: parseWorkouts(workouts),
    trainingTrend: trend,
  });
  const good = "9/20 良 一杯\n66.0 51.5 38.0\n10/8 良 一杯\n66.0 51.5 38.0";
  const worse = "9/20 良 一杯\n66.0 51.5 38.0\n10/8 良 一杯\n70.0 55.0 41.0";
  const race = (horses: ReturnType<typeof horse>[]) => ({ name: "", venue: "", surface: "ダ" as const, distance: 1400, horses });

  it("時計が出ていない馬は調子落ちとして位置を下げる", () => {
    const p = predict(race([horse(1, good), horse(2, worse), horse(3, good)]));
    const [a, b] = p.analyses;
    expect(b.condition?.label).toBe("不調");
    expect(b.condition?.reasons.join()).toContain("以前の時計より");
    expect(b.early).toBeGreaterThan(a.early);
    expect(b.late).toBeGreaterThan(a.late);
    expect(b.style).toBe(a.style); // 脚質の判定は過去レースのまま
  });

  it("調教の反映をオフにすると位置は変わらない", () => {
    const off = { ...DEFAULT_OPTIONS, useTraining: false };
    const withWorse = predict(race([horse(1, good), horse(2, worse), horse(3, good)]), off);
    const withGood = predict(race([horse(1, good), horse(2, good), horse(3, good)]), off);
    expect(withWorse.analyses[1].early).toBe(withGood.analyses[1].early);
  });

  it("調教欄の矢印も使う", () => {
    const p = predict(race([horse(1, good, "↑"), horse(2, good, "↓"), horse(3, good)]));
    expect(p.analyses[0].condition?.value).toBeLessThan(0);
    expect(p.analyses[1].condition?.value).toBeGreaterThan(0);
  });
});

describe("ゴール前", () => {
  const horse = (n: number, past: string, workouts?: string) => ({
    number: n,
    frame: n,
    name: `H${n}`,
    pastRaces: parsePassingText(past),
    workouts: workouts ? parseWorkouts(workouts) : undefined,
  });
  const race = (horses: ReturnType<typeof horse>[], venue = "", distance = 1600) => ({
    name: "",
    venue,
    surface: "芝" as const,
    distance,
    horses,
  });

  it("末脚のある馬は最終コーナーより前に来る", () => {
    const horses = [
      horse(1, "3-3/10(36.5) 3-3/10(36.5)"),
      horse(2, "6-6/10(34.0) 6-6/10(34.0)"),
      horse(3, "5-5/10(35.5) 5-5/10(35.5)"),
    ];
    const a = predict(race(horses)).analyses;
    expect(a[1].goal!).toBeLessThan(a[1].late);
    expect(a[0].goal!).toBeGreaterThan(a[0].late);
  });

  it("直線の長いコースほど末脚の差が大きく出る", () => {
    const horses = [horse(1, "3-3/10(36.5)"), horse(2, "6-6/10(34.0)"), horse(3, "5-5/10(35.5)")];
    const gain = (venue: string, d: number) => {
      const a = predict(race(horses, venue, d)).analyses[1];
      return a.late - a.goal!;
    };
    expect(gain("東京", 1600)).toBeGreaterThan(gain("小倉", 1800));
  });

  it("上がりがなくても調教の終いで伸びを見る", () => {
    const fast = "10/8 良 馬なり\n66.0 51.5 37.5";
    const slow = "10/8 良 馬なり\n68.0 54.0 41.0";
    const horses = [horse(1, "5-5/10", slow), horse(2, "5-5/10", fast), horse(3, "5-5/10", slow)];
    const a = predict(race(horses), { ...DEFAULT_OPTIONS, useTraining: false }).analyses;
    expect(a[1].goal!).toBeLessThan(a[0].goal!);
  });

  it("全頭がゴール前の隊列に入る", () => {
    const p = predict(SAMPLE_RACE);
    expect(p.goal).toHaveLength(SAMPLE_RACE.horses.length);
  });
});
