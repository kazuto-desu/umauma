import type { MyMark, Race } from "./types";

export const MY_MARKS: MyMark[] = ["◎", "○", "▲", "△", "☆"];

export interface MyRecord {
  races: number; // 自分の ◎ と着順があるレース数
  honmeiWin: number; // ◎ が1着
  honmeiTop3: number; // ◎ が3着以内
  oddsRaces: number; // そのうち ◎ にオッズがあるレース数
  honmeiReturn?: number; // ◎ の単勝を100円ずつ買ったときの回収率 (%)
  markedTop3: number; // 印を付けた馬 (☆以外) のうち3着以内に来た延べ頭数
  marked: number; // 印を付けた馬 (☆以外) の延べ頭数
}

/** 保存したレースで、自分が付けた印の成績を数える */
export function myRecord(races: Race[]): MyRecord {
  const rec: MyRecord = { races: 0, honmeiWin: 0, honmeiTop3: 0, oddsRaces: 0, markedTop3: 0, marked: 0 };
  let paid = 0;
  for (const race of races) {
    const finish = (race.result?.finish ?? "").split(",").map(Number).filter(Boolean);
    const honmei = race.horses.find((h) => h.myMark === "◎");
    if (finish.length < 3 || !honmei) continue;
    const top3 = finish.slice(0, 3);
    rec.races++;
    if (finish[0] === honmei.number) rec.honmeiWin++;
    if (top3.includes(honmei.number)) rec.honmeiTop3++;
    if (honmei.odds) {
      rec.oddsRaces++;
      if (finish[0] === honmei.number) paid += honmei.odds * 100;
    }
    for (const h of race.horses.filter((x) => x.myMark && x.myMark !== "☆")) {
      rec.marked++;
      if (top3.includes(h.number)) rec.markedTop3++;
    }
  }
  if (rec.oddsRaces > 0) rec.honmeiReturn = Math.round(paid / rec.oddsRaces);
  return rec;
}
