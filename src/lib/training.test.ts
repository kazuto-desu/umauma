import { describe, expect, it } from "vitest";
import { lapShape, lapsOf, latestWorkout, parseWorkouts } from "./training";

describe("parseWorkouts", () => {
  it("累計タイムの並びを追い切りとして拾い、ハロン数を推定する", () => {
    const w = parseWorkouts("10/8 大井外 良 66.5-51.8-38.6-12.9 馬なり\n10/1 大井外 稍 5F 68.0 53.1 39.4 13.4 強め");
    expect(w).toHaveLength(2);
    expect(w[0]).toEqual({
      date: "10/8",
      course: "大井外 良",
      intensity: "馬なり",
      marks: [
        { furlong: 5, time: 66.5 },
        { furlong: 4, time: 51.8 },
        { furlong: 3, time: 38.6 },
        { furlong: 1, time: 12.9 },
      ],
    });
    expect(w[1].date).toBe("10/1");
    expect(w[1].intensity).toBe("強め");
  });

  it("2F が含まれていれば 2F と判断する", () => {
    const w = parseWorkouts("39.0 25.6 12.6");
    expect(w[0].marks.map((m) => m.furlong)).toEqual([3, 2, 1]);
  });

  it("ハロン表記があればそれを使う", () => {
    const w = parseWorkouts("6F 82.0 5F 67.0 4F 52.5 3F 38.8 1F 12.7");
    expect(w[0].marks.map((m) => m.furlong)).toEqual([6, 5, 4, 3, 1]);
  });

  it("時計でない数字 (馬体重や単独の数字) は無視する", () => {
    expect(parseWorkouts("馬体重 480 kg オッズ 12.5")).toEqual([]);
  });
});

describe("lapsOf / lapShape", () => {
  it("累計タイムを1ハロンごとのラップにし、まとめて計った区間は均等に割る", () => {
    const [w] = parseWorkouts("66.5-51.8-38.6-12.9");
    const laps = lapsOf(w);
    expect(laps.map((l) => l.time)).toEqual([14.7, 13.2, 12.9, 12.9, 12.9]);
    expect(laps.map((l) => l.estimated)).toEqual([false, false, true, true, false]);
    expect(lapShape(laps)).toBe("加速");
  });

  it("終いが遅くなっていれば失速", () => {
    const [w] = parseWorkouts("4F 52.0 3F 39.0 2F 26.0 1F 13.0");
    expect(lapShape(lapsOf(w))).toBe("平行");
    const [w2] = parseWorkouts("4F 50.0 3F 37.0 2F 24.8 1F 13.0");
    expect(lapShape(lapsOf(w2))).toBe("失速");
  });

  it("日付の新しいものを最終追い切りにする", () => {
    const list = parseWorkouts("10/1 64.0-50.0-37.0-12.5\n10/8 66.5-51.8-38.6-12.9");
    expect(latestWorkout(list)?.date).toBe("10/8");
  });
});
