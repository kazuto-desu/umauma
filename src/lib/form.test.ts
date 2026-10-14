import { describe, expect, it } from "vitest";
import { classOf, fieldClass, formOf, marginSeconds } from "./form";
import { parsePassingText } from "./notation";

describe("classOf", () => {
  it("中央・地方のクラスを共通の物差しにする", () => {
    expect(classOf("2026.09.14 中山 秋風S 3勝")).toEqual({ name: "3勝", level: 9 });
    expect(classOf("天皇賞(秋) GⅠ")).toEqual({ name: "G1", level: 13 });
    expect(classOf("JBCクラシック Jpn1")).toEqual({ name: "G1", level: 13 });
    expect(classOf("C2三 12頭")?.level).toBe(2);
    expect(classOf("Ｂ１ 特別")?.level).toBe(6);
    expect(classOf("東京 2歳未勝利")?.level).toBe(4); // 中央の未勝利
    expect(classOf("川崎 新馬")?.level).toBe(0); // 地方の新馬
    expect(classOf("騎手B 57.0")).toBeUndefined();
  });
});

describe("marginSeconds", () => {
  it("馬身や秒の着差を秒にする", () => {
    expect(marginSeconds("0.3")).toBe(0.3);
    expect(marginSeconds("クビ")).toBe(0.07);
    expect(marginSeconds("1.1/2")).toBeCloseTo(0.26, 2);
    expect(marginSeconds("3/4")).toBeCloseTo(0.13, 2);
    expect(marginSeconds("大差")).toBe(3);
  });
});

describe("formOf (クラス込み)", () => {
  it("同じ着順・着差でも、上のクラスで走った馬を良く見る", () => {
    const run = (classLevel: number) => [{ passing: [5, 5], fieldSize: 10, finish: 5, margin: 1.0, classLevel }];
    const ref = fieldClass([{ pastRaces: run(4) }, { pastRaces: run(5) }, { pastRaces: run(6) }]);
    expect(ref).toBe(5);
    expect(formOf(run(6), ref)!).toBeLessThan(formOf(run(5), ref)!);
    expect(formOf(run(5), ref)!).toBeLessThan(formOf(run(4), ref)!);
  });
});

describe("parsePassingText の着順・着差", () => {
  it("netkeiba のような馬柱 (日付の次の行が着順、勝ち馬の後ろに (タイム差))", () => {
    const text = [
      "2026.09.14 中山11", "3", "秋風S 3勝", "芝1800 1:46.5 良", "16頭 7番 2人 騎手A 57.0", "2-2-2-2 (34.5) 480(+2)", "ライバルホース(0.3)",
      "2026.08.10 新潟10", "1", "夏草特別 2勝", "芝2000 2:00.1 稍", "14頭 3番 1人 騎手A 57.0", "3-3-2 (35.0) 478(0)", "ニバンテ(-0.2)",
    ].join("\n");
    expect(parsePassingText(text).map((r) => [r.finish, r.margin, r.className])).toEqual([
      [3, 0.3, "3勝"],
      [1, 0, "2勝"],
    ]);
  });

  it("「5着」と「着差 クビ」の書き方", () => {
    const r = parsePassingText("10/5 大井 B2 5着 12頭 1200ダ 4-4 着差 クビ")[0];
    expect(r).toMatchObject({ finish: 5, margin: 0.07, className: "B2", classLevel: 5 });
  });
});
