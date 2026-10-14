import { describe, expect, it } from "vitest";
import { parsePassingText } from "./notation";
import { parsePastedCard } from "./paste";

// サイトの馬柱をコピーしたときのような、改行やタブが混ざったテキスト (内容は架空)
const CARD = `
1\t1\t
サンプルスター
牡4 57.0 騎手A
戦績 3-1-0-2
2026.09.14 中山
秋風S 3勝
芝1800 1:46.5 良
16頭 7番 2人
2-2-2-2
(ライバルホース)
2026.08.10 新潟
夏草特別
芝2000 2:00.1 稍
14頭 3番 1人
3ー3ー2
2\t2
テストランナー
牡5 57.0 騎手B
2026.09.07 中京
12頭 5番 6人
10-9-7
(サンプルスター)
3\t3
ハヤテノカゼ
牝4 55.0 騎手C
`;

describe("parsePassingText (貼り付け)", () => {
  it("直前の「○頭」を頭数として拾い、着度数や日付は無視する", () => {
    expect(parsePassingText(CARD.split("2\t2")[0])).toEqual([
      { passing: [2, 2, 2, 2], fieldSize: 16, surface: "芝", distance: 1800, className: "3勝", classLevel: 9 },
      { passing: [3, 3, 2], fieldSize: 14, surface: "芝", distance: 2000 },
    ]);
  });
  it("頭数を超える数字は通過順とみなさない", () => {
    expect(parsePassingText("8頭 12-13")).toEqual([]);
  });
});

describe("parsePastedCard", () => {
  it("馬番と馬名の並びから出走馬を作る", () => {
    const r = parsePastedCard(CARD, [])!;
    expect(r.mode).toBe("new");
    expect(r.horses.map((h) => [h.frame, h.number, h.name])).toEqual([
      [1, 1, "サンプルスター"],
      [2, 2, "テストランナー"],
      [3, 3, "ハヤテノカゼ"],
    ]);
    expect(r.horses[1].pastRaces).toEqual([{ passing: [10, 9, 7], fieldSize: 12 }]);
    expect(r.horses[2].pastRaces).toEqual([]);
    expect(r.withPassing).toBe(2);
  });

  it("表の馬名を目印に通過順だけ更新する (相手馬として括弧付きで出る名前は目印にしない)", () => {
    const current = [
      { number: 1, frame: 1, name: "サンプルスター", pastRaces: [] },
      { number: 2, frame: 2, name: "テストランナー", pastRaces: [] },
    ];
    const r = parsePastedCard("サンプルスター 16頭 1-1 テストランナー 10頭 4-4 (サンプルスター)", current)!;
    expect(r.mode).toBe("update");
    expect(r.horses.map((h) => h.pastRaces)).toEqual([
      [{ passing: [1, 1], fieldSize: 16 }],
      [{ passing: [4, 4], fieldSize: 10 }],
    ]);
  });

  it("馬が見つからなければ null", () => {
    expect(parsePastedCard("今日はいい天気", [])).toBeNull();
  });
});

describe("騎手の取り込み", () => {
  it("斤量の後ろの名前を騎手として拾う", () => {
    const r = parsePastedCard("1 1 サンプルスター 牡4 57.0 騎手A 2 2 テストランナー 牝3 ▲52.0 騎手B", [])!;
    expect(r.horses.map((h) => h.jockey)).toEqual(["騎手A", "騎手B"]); // 減量の印付きの斤量も読む
  });
});

describe("馬名が表にあるときの騎手の取り込み", () => {
  it("通過順と一緒に騎手名も更新する", () => {
    const current = [
      { number: 1, frame: 1, name: "サンプルスター", pastRaces: [] },
      { number: 2, frame: 2, name: "テストランナー", pastRaces: [] },
    ];
    const r = parsePastedCard("サンプルスター 牡4 57.0 騎手A 16頭 1-1 テストランナー 牝3 55.0 騎手B", current)!;
    expect(r.horses.map((h) => h.jockey)).toEqual(["騎手A", "騎手B"]);
  });
});

describe("いろいろな書き方の騎手名", () => {
  const current = [
    { number: 1, frame: 1, name: "サンプルスター", pastRaces: [] },
    { number: 2, frame: 2, name: "テストランナー", pastRaces: [] },
  ];
  const jockeys = (text: string) => parsePastedCard(text, current)!.horses.map((h) => h.jockey);

  it("整数の斤量・kg 付き", () => {
    expect(jockeys("サンプルスター 牡4 56 騎手A 12頭 1-1 テストランナー 牝3 54kg 騎手B")).toEqual(["騎手A", "騎手B"]);
  });
  it("減量の印", () => {
    expect(jockeys("サンプルスター 牡4 ▲53 新人C 12頭 1-1 テストランナー 牝3 54.0 ☆新人D")).toEqual(["新人C", "新人D"]);
  });
  it("騎手名が斤量の前", () => {
    expect(jockeys("サンプルスター 牡4 騎手A 56.0 12頭 1-1 テストランナー 牝3 騎手B 54")).toEqual(["騎手A", "騎手B"]);
  });
  it("見出し付き", () => {
    expect(jockeys("サンプルスター 騎手 騎手A 12頭 1-1 テストランナー 騎手:騎手B")).toEqual(["騎手A", "騎手B"]);
  });
  it("性齢や毛色は騎手名にしない", () => {
    expect(jockeys("サンプルスター 56 牡4 栗毛 12頭 1-1 テストランナー 牝3")).toEqual([undefined, undefined]);
  });
});
