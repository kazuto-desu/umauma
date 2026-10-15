import { pastDate } from "./conditions";
import { SIGNAL_TYPES, historySignals } from "./signals";
import type { SignalStat } from "./signals";
import type { PastRace, Race } from "./types";

export interface HistorySummary {
  samples: number; // 数えた過去走の数 (1頭の1走で1件)
  horses: number; // その馬の頭数
  top3: number; // そのうち3着以内
  stats: SignalStat[]; // 型ごとの成績 (過去走だけで決まる型のみ)
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * 保存した馬柱 (と今のレース) に入っている過去走を、馬ごとにつなげて並べる。
 * 同じ馬が何度も出てきたら過去走を合わせ、同じ日のレースは1つにする。日付が読めない過去走は使わない。
 */
export function horseHistories(races: Race[]): Map<string, PastRace[]> {
  const byHorse = new Map<string, Map<string, PastRace>>();
  for (const race of races) {
    if (!race.date) continue;
    for (const h of race.horses) {
      if (!h.name) continue;
      const runs = byHorse.get(h.name) ?? new Map<string, PastRace>();
      for (const r of h.pastRaces) {
        const d = pastDate(r.date, race.date);
        if (!d) continue;
        const key = iso(d);
        const old = runs.get(key);
        // 項目が多く入っている方を残す
        if (!old || Object.keys(r).length > Object.keys(old).length) runs.set(key, { ...r, date: key });
      }
      byHorse.set(h.name, runs);
    }
  }
  const out = new Map<string, PastRace[]>();
  for (const [name, runs] of byHorse) out.set(name, [...runs.values()].sort((a, b) => (a.date! < b.date! ? 1 : -1)));
  return out;
}

/**
 * 馬柱の過去走で型の成績を数える。ある過去走を「そのときのレース」、それより前の過去走を「そのときの近走」とみなし、
 * 過去走だけで決まる型 (好走安定・クラス実績・コース実績・内容のある負け・条件好転/悪化・叩き2戦目・大敗続き) が
 * 当てはまっていたか、実際に3着以内だったかを数える。結果を入れていないレースの馬柱も使える。
 * venue を渡すと、その競馬場で走った過去走だけ。
 */
export function historyStats(races: Race[], venue?: string): HistorySummary {
  const acc = new Map<string, { count: number; top3: number; wins: number }>();
  let samples = 0;
  let top3 = 0;
  let horses = 0;
  const toDate = (d?: string) => (d ? new Date(`${d}T00:00:00`) : undefined);
  for (const runs of horseHistories(races).values()) {
    let used = false;
    for (let k = 0; k < runs.length - 1; k++) {
      const target = runs[k];
      if (!target.finish || (venue && target.venue !== venue)) continue;
      const history = runs.slice(k + 1, k + 7);
      const signals = historySignals(history, {
        today: toDate(target.date),
        dateOf: toDate,
        venue: target.venue,
        distance: target.distance,
        classLevel: target.classLevel,
        carried: target.carried,
      });
      samples++;
      used = true;
      const placed = target.finish <= 3;
      if (placed) top3++;
      for (const s of signals) {
        const a = acc.get(s.key) ?? { count: 0, top3: 0, wins: 0 };
        a.count++;
        if (placed) a.top3++;
        if (target.finish === 1) a.wins++;
        acc.set(s.key, a);
      }
    }
    if (used) horses++;
  }
  const stats = SIGNAL_TYPES.filter((t) => acc.has(t.key)).map((t) => {
    const a = acc.get(t.key)!;
    return { key: t.key, label: t.label, kind: t.kind, count: a.count, top3: a.top3, wins: a.wins, oddsCount: 0 };
  });
  return { samples, horses, top3, stats };
}

/** 保存したレースの結果から数えた型の成績に、馬柱の過去走から数えた成績を足す (単勝回収率は結果の方だけ) */
export function mergeStats(fromResults: SignalStat[], fromHistory: SignalStat[]): SignalStat[] {
  const hist = new Map(fromHistory.map((s) => [s.key, s]));
  return fromResults.map((s) => {
    const h = hist.get(s.key);
    return h ? { ...s, count: s.count + h.count, top3: s.top3 + h.top3, wins: s.wins + h.wins } : s;
  });
}
