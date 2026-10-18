import { describe, expect, it } from "vitest";
import { parsePastedCard, splitByEntries } from "./paste";
import {
  courseBaselines,
  courseKey,
  lapShape,
  latestWorkout,
  parsePartner,
  parseWorkouts,
  risingOf,
  scoreWorkout,
  setCourseOffsets,
  segmentsOf,
  trainingCommentOf,
} from "./training";
import type { Workout } from "./types";

// 競馬ブック (地方) の調教欄をコピーしたときの形 (馬名・時計は架空)
const LOCAL = `1
1\tサンプルスター\t変わらず\t→
(前回)\t9/4 川崎調教場 良\t一杯
66.7\t52.0\t39.1\t\t
　　\t9/25 川崎調教場 重\t一杯
52.5\t39.2\t\t
　　\t10/8 川崎調教場 良\t馬なり
53.0\t40.0\t\t
2
2\tテストランナー\t好調持続\t↑
(前回)\t9/6 川崎調教場 不\t一杯
66.6\t52.1\t38.9\t\t
ライバルホース（Ｃ１）馬なりの内同入
　　\t10/9 川崎調教場 良\t一杯
68.4\t51.7\t37.9\t\t
ヒートロア（2歳）一杯の内を4Ｆ付同入
`;

describe("parseWorkouts (地方・3Fまでの時計)", () => {
  const w = parseWorkouts(LOCAL.split("\n2\n")[0]);

  it("時計が次の行にあっても、日付・コース・強さと結びつける", () => {
    expect(w).toHaveLength(3);
    expect(w[0]).toEqual({
      date: "9/4",
      course: "川崎調教場 良",
      intensity: "一杯",
      beforeLastRace: true,
      marks: [
        { furlong: 5, time: 66.7 },
        { furlong: 4, time: 52.0 },
        { furlong: 3, time: 39.1 },
      ],
    });
    expect(w[1].marks.map((m) => m.furlong)).toEqual([4, 3]);
    expect(w[2]).toMatchObject({ date: "10/8", intensity: "馬なり" });
    expect(w[2].beforeLastRace).toBeUndefined();
  });

  it("区間ごとのタイムにし、上がり3Fはまとめた区間のまま残す", () => {
    expect(segmentsOf(w[0])).toEqual([
      { span: 1, total: 14.7, perFurlong: 14.7 },
      { span: 1, total: 12.9, perFurlong: 12.9 },
      { span: 3, total: 39.1, perFurlong: 13.0 },
    ]);
  });

  it("併せ馬の行をその追い切りに付ける", () => {
    const w2 = parseWorkouts(LOCAL.split("\n2\n")[1]);
    expect(w2[0].partner).toBe("ライバルホース（Ｃ1）馬なりの内同入"); // 全角数字は半角にそろう
    expect(w2[1].partner).toBe("ヒートロア（2歳）一杯の内を4Ｆ付同入");
    expect(w2[1].intensity).toBe("一杯");
  });

  it("日付の一番新しいものを最終追い切りにする", () => {
    expect(latestWorkout(w)?.date).toBe("10/8");
  });

  it("馬名の行から短評と矢印を拾う", () => {
    expect(trainingCommentOf(LOCAL, "テストランナー")).toEqual({ comment: "好調持続", trend: "↑" });
  });

  it("「馬番 馬名」で馬ごとに分けられる", () => {
    expect(splitByEntries(LOCAL).map((e) => [e.number, e.name])).toEqual([
      [1, "サンプルスター"],
      [2, "テストランナー"],
    ]);
    // 出馬表としては読まない (通過順がないので馬だけ作られる)
    expect(parsePastedCard(LOCAL, [])?.horses.map((h) => h.name)).toEqual(["サンプルスター", "テストランナー"]);
  });
});

describe("parseWorkouts (中央・1Fまでの時計)", () => {
  it("2F がなければ 3F→1F とみなす", () => {
    const [w] = parseWorkouts("10/8 美浦W 良 66.5-51.8-38.6-12.9 馬なり");
    expect(w.marks.map((m) => m.furlong)).toEqual([5, 4, 3, 1]);
    expect(segmentsOf(w).map((s) => [s.span, s.total])).toEqual([
      [1, 14.7],
      [1, 13.2],
      [2, 25.7],
      [1, 12.9],
    ]);
    expect(lapShape(w)).toBe("加速");
  });

  it("2F が含まれていれば 2F と判断する", () => {
    expect(parseWorkouts("39.0 25.6 12.6")[0].marks.map((m) => m.furlong)).toEqual([3, 2, 1]);
  });

  it("ハロン表記があればそれを使う", () => {
    expect(parseWorkouts("6F 82.0 5F 67.0 4F 52.5 3F 38.8 1F 12.7")[0].marks.map((m) => m.furlong)).toEqual([6, 5, 4, 3, 1]);
  });

  it("時計でない数字は無視する", () => {
    expect(parseWorkouts("馬体重 480 kg オッズ 12.5 2.3")).toEqual([]);
  });

  it("終いが平行・失速のものを見分ける", () => {
    expect(lapShape(parseWorkouts("4F 52.0 3F 39.0 2F 26.0 1F 13.0")[0])).toBe("平行");
    expect(lapShape(parseWorkouts("4F 50.0 3F 37.0 2F 24.8 1F 13.0")[0])).toBe("失速");
  });
});

describe("scoreWorkout", () => {
  const score = (t: string) => scoreWorkout(parseWorkouts(t)[0])!;

  it("終いが速く加速している追い切りほど評価が高い (値が小さい)", () => {
    const strong = score("10/9 川崎調教場 良 一杯\n68.4 51.7 37.9");
    const flat = score("10/9 川崎調教場 良 一杯\n67.6 52.0 39.1");
    expect(strong.score).toBeLessThan(flat.score);
    expect(strong.reasons).toEqual(["終い3F 37.9 (≒12.6)", "1.2秒加速", "一杯"]);
    expect(flat.reasons[1]).toBe("0.1秒失速");
  });

  it("同じ時計なら馬なりの方が一杯より上", () => {
    expect(score("良 馬なり\n68.0 52.0 38.5").score).toBeLessThan(score("良 一杯\n68.0 52.0 38.5").score);
  });

  it("重馬場の時計は割り引く", () => {
    expect(score("良 馬なり\n68.0 52.0 38.5").score).toBeLessThan(score("重 馬なり\n68.0 52.0 38.5").score);
  });

  it("加速の評価は1秒までで頭打ち (前半が極端に遅いだけの時計を過大評価しない)", () => {
    const slowStart = score("良 馬なり\n75.0 57.0 38.5");
    const normal = score("良 馬なり\n68.0 52.5 38.5"); // こちらも1.2秒加速 (上限超え)
    expect(slowStart.score).toBe(normal.score);
  });
});

describe("併せ馬", () => {
  it("先着・同入・遅れ、着差、内外、相手のクラスを読む", () => {
    expect(parsePartner("ライバルホース（Ｃ１）馬なりの内同入")).toEqual({
      result: "同入",
      margin: undefined,
      position: "内",
      partnerIntensity: "馬なり",
      partnerClass: "Ｃ1",
    });
    expect(parsePartner("ライバルホース（Ｂ３）強めの外0.3秒先着")).toMatchObject({ result: "先着", margin: 0.3, position: "外" });
    expect(parsePartner("ヒートロア（2歳）一杯の内を4Ｆ付1馬身遅れ")).toMatchObject({
      result: "遅れ",
      margin: 0.2,
      partnerClass: "2歳",
      partnerIntensity: "一杯",
    });
  });

  const base = "10/9 川崎調教場 良 一杯\n68.4 51.7 37.9\n";
  const withPartner = (p: string) => scoreWorkout(parseWorkouts(base + p)[0])!;

  it("先着は加点、遅れは減点、大差ほど大きく", () => {
    const none = scoreWorkout(parseWorkouts(base)[0])!.score;
    const lead = withPartner("Ａ（Ｃ1）一杯の内0.2秒先着");
    const bigLead = withPartner("Ａ（Ｃ1）一杯の内0.5秒先着");
    const behind = withPartner("Ａ（Ｃ1）一杯の内0.2秒遅れ");
    expect(lead.score).toBeLessThan(none);
    expect(bigLead.score).toBeLessThan(lead.score);
    expect(behind.score).toBeGreaterThan(none);
    expect(lead.reasons).toContain("併せ0.2秒先着");
  });

  it("外を回っての先着は内より上、2歳馬相手の先着は割り引く", () => {
    expect(withPartner("Ａ（Ｃ1）一杯の外0.2秒先着").score).toBeLessThan(withPartner("Ａ（Ｃ1）一杯の内0.2秒先着").score);
    expect(withPartner("Ａ（2歳）一杯の内0.2秒先着").score).toBeGreaterThan(withPartner("Ａ（Ｃ1）一杯の内0.2秒先着").score);
  });

  it("相手が馬なりで自分が一杯の同入は少し減点", () => {
    expect(withPartner("Ａ（Ｃ1）馬なりの内同入").score).toBeGreaterThan(withPartner("Ａ（Ｃ1）一杯の内同入").score);
  });
});

describe("調教コースの補正", () => {
  const many = (course: string, perFurlong: number, n: number) =>
    Array.from({ length: n }, () => ({ course, perFurlong }));

  it("コース名から馬場状態を除く", () => {
    expect(courseKey("川崎調教場 良")).toBe("川崎調教場");
    expect(courseKey("大井外 稍重")).toBe("大井外");
  });

  it("本数が足りたコースが2つ以上あれば、全体平均との差を補正値にする", () => {
    const b = courseBaselines([...many("速いコース", 12.6, 20), ...many("遅いコース", 13.0, 20), ...many("少ないコース", 12.0, 5)]);
    const at = (c: string) => b.find((x) => x.course === c)!;
    expect(at("速いコース").offset).toBe(-0.2);
    expect(at("遅いコース").offset).toBe(0.2);
    expect(at("少ないコース").offset).toBe(0);
  });

  it("コースが1つしかなければ補正しない", () => {
    expect(courseBaselines(many("川崎調教場", 12.8, 30))[0].offset).toBe(0);
  });

  it("時計の出やすいコースの時計は割り引かれる", () => {
    const w = parseWorkouts("良 一杯\n68.4 51.7 37.9")[0];
    expect(scoreWorkout(w, -0.2)!.score).toBeGreaterThan(scoreWorkout(w, 0)!.score);
    expect(scoreWorkout(w, -0.2)!.reasons).toContain("コース補正+0.2");
  });
});

describe("risingOf (調子の上昇度)", () => {
  const ws = (t: string) => parseWorkouts(t);

  it("前走前の追い切りより良くなっていれば上昇", () => {
    const r = risingOf(ws("(前回) 9/4 川崎調教場 良 一杯\n66.6 52.1 38.9\n10/9 川崎調教場 良 一杯\n68.4 51.7 37.9"))!;
    expect(r.score).toBeGreaterThan(0);
    expect(r.reasons[0]).toBe("前走前の追い切りより上がり3Fが 38.9→37.9 (1.0秒速い)");
  });

  it("時計が落ちていればマイナス", () => {
    const r = risingOf(ws("9/4 良 一杯\n66.7 52.0 39.1\n10/8 良 一杯\n68.0 54.0 41.0"))!;
    expect(r.score).toBeLessThan(0);
  });

  it("続けて時計を詰めていれば加点", () => {
    const r = risingOf(ws("9/4 良 馬なり\n55.0 41.5\n9/25 良 馬なり\n54.0 40.5\n10/8 良 馬なり\n53.0 39.5"))!;
    expect(r.reasons).toContain("追い切りのたびに時計を詰めている");
  });

  it("矢印と短評も使う。材料がなければ判定しない", () => {
    expect(risingOf(undefined, "↑", "好調持続")!.reasons).toEqual(["調教欄の評価 ↑", "短評「好調持続」"]);
    expect(risingOf(undefined, "→", "変わらず")).toBeUndefined();
  });
});

describe("調教コースの扱い", () => {
  const w = (date: string, course: string, marks: [number, number][], beforeLastRace = false): Workout => ({
    date, course, beforeLastRace, marks: marks.map(([furlong, time]) => ({ furlong, time })),
  });

  it("設定したコースの補正を、補正を渡さない評価にも使う", () => {
    const x = w("10/8", "美坂", [[4, 52.0], [3, 38.0], [2, 25.0], [1, 12.5]]);
    const plain = scoreWorkout(x)!.score;
    setCourseOffsets((v) => (courseKey(v.course) === "美坂" ? -0.5 : 0));
    try {
      expect(scoreWorkout(x)!.score).toBeCloseTo(plain + 0.5, 5); // 時計の出やすいコースは割り引く
    } finally {
      setCourseOffsets(() => 0);
    }
  });

  it("上昇度は同じコースの追い切りと比べる (違うコースの速い時計と比べない)", () => {
    // 坂路で速い時計 → ウッドで普通の時計 → ウッドで少し詰めた時計
    const list = [
      w("9/20", "美坂", [[4, 50.0], [3, 36.5], [2, 24.0], [1, 11.8]], true),
      w("10/1", "美Ｗ", [[5, 68.0], [4, 53.0], [3, 39.0], [1, 12.8]]),
      w("10/8", "美Ｗ", [[5, 67.5], [4, 52.5], [3, 38.5], [1, 12.5]]),
    ];
    const r = risingOf(list)!;
    expect(r.score).toBeGreaterThan(0);
  });
});
