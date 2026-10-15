import { describe, expect, it } from "vitest";
import { filledKinds, importAny } from "./importer";
import type { ImportOutcome } from "./importer";
import type { Race } from "./types";

// 架空の馬で、競馬ブックなどから貼るものを順に貼っていく
const CARD = [
  "1", "1\t", "山田太", "54", "0.0.0.3", "12.5", "チチ", "牝2", "アオゾラ", "ハハ", "鹿", "ハハチチ",
  "7川1 9.7 30ポイ 7頭", "3", "1400ダ1.43.4", "山田太 54", "M 42.7-39.7", "②\t2\t2\t3", "カチウマ 0.5 398", "3枠2人",
  "2", "2\t", "鈴木次", "55", "0.0.0.0", "3.1", "チチ", "牡2", "ユウヒ", "ハハ", "栗", "ハハチチ",
  "7川5 9.11 新馬 7頭", "1", "1400ダ1.40.1", "鈴木次 54", "S 41.2-38.7", "1\t1\t1\t1", "ニチャク 0.3 501", "4枠1人",
  "3", "3\t", "田中三", "54", "0.0.0.0", "8.0", "チチ", "牝2", "ホシゾラ", "ハハ", "鹿", "ハハチチ",
  "7川5 9.11 新馬 7頭", "4", "1400ダ1.41.0", "田中三 54", "S 42.0-39.5", "4\t4\t4\t4", "カチウマ 0.9 470", "5枠3人",
].join("\n");
const TRAINING = "1\n1\tアオゾラ\t好調持続\t→\n\t10/8 川崎調教場 良\t一杯\n66.7\t52.0\t39.1\t\n2\n2\tユウヒ\t直線の伸び良\t↑\n\t10/8 川崎調教場 良\t馬なり\n68.0\t53.0\t39.5\t";
const COMMENTS = "1\n1\tアオゾラ\n○アオゾラ【山田師】状態はいいので思い切って行く。\n2\n2\tユウヒ\n○ユウヒ（不安残） 　担当厩務員――調整ができなかった。";
const PADDOCK = "A\n①アオゾラ\t494(-5)\t3.3\n毛ヅヤ良化\t\t－";
const ODDS = "1 3.3\n2 2.1\n3 15.4";
const RESULT = "1\t2\t\nユウヒ\n牡2 鈴木次 55\n川某\n1\t1\t1\t1\n1.40.0\n(38.0)\n2\t1\t\nアオゾラ\n牝2 山田太 54\n川某\n2\t2\t2\t2\n1.40.3\n(38.4)\n3\t3\t\nホシゾラ\n牝2 田中三 54\n川某\n4\t4\t3\t3\n1.40.9\n(38.9)";

describe("importAny", () => {
  it("貼ったものの種類を見分けて、順に読み込む", () => {
    let race: Race = { name: "", venue: "川崎", surface: "ダ", distance: 1400, horses: [] };
    const kinds: string[] = [];
    for (const text of [CARD, TRAINING, COMMENTS, PADDOCK, ODDS, RESULT]) {
      const r = importAny(text, race);
      expect("error" in r ? r.error : "").toBe("");
      kinds.push((r as ImportOutcome).kind);
      race = (r as ImportOutcome).race;
    }
    expect(kinds).toEqual(["card", "training", "comments", "paddock", "odds", "result"]);
    expect(filledKinds(race)).toEqual({ card: true, training: true, comments: true, paddock: true, odds: true, result: true });
    expect(race.horses.map((h) => h.name)).toEqual(["アオゾラ", "ユウヒ", "ホシゾラ"]);
    expect(race.result?.finish).toBe("2,1,3");
  });

  it("読み取れないときは理由を返す", () => {
    expect(importAny("こんにちは", { name: "", venue: "", surface: "ダ", distance: 0, horses: [] })).toHaveProperty("error");
  });
});
