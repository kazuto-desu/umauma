import { horseHistories } from "./historyStats";
import { parseCornerNotation } from "./result";
import type { Going, Race } from "./types";

/**
 * 1頭の1走。保存したレースの結果と、馬柱の過去走の両方から作る。
 * 位置は 0 (先頭・最内) 〜 1 (最後方・大外) にそろえる。
 */
export interface RunRecord {
  horse: string;
  date: string; // YYYY-MM-DD
  venue?: string;
  surface?: "芝" | "ダ" | "障";
  distance?: number;
  going?: Going;
  fieldSize: number;
  first?: number; // 1コーナー (最初の通過順) の位置
  firstRank?: number; // 1コーナーの順位 (1 = 先頭)
  last?: number; // 最終コーナーの位置
  gate?: number; // 0 (最内) 〜 1 (大外)
  finish?: number;
  source: "result" | "history";
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const rel = (rank: number, n: number) => (n > 1 ? (rank - 1) / (n - 1) : 0);

/** 保存したレース (結果あり) の各馬の走り */
function runsFromResults(race: Race): RunRecord[] {
  const order = (race.result?.finish ?? "").split(",").map(Number).filter(Boolean);
  if (!race.date || order.length < 3) return [];
  const runners = race.horses.filter((h) => !h.scratched);
  const n = runners.length;
  const first = parseCornerNotation(race.result?.firstCorner ?? "", race.horses);
  const final = parseCornerNotation(race.result?.finalCorner ?? "", race.horses);
  const at = (list: typeof first, num: number) => {
    const k = list.findIndex((p) => p.number === num);
    return k >= 0 ? k + 1 : undefined;
  };
  return runners.map((h) => {
    const f = at(first, h.number);
    const l = at(final, h.number);
    const k = order.indexOf(h.number);
    return {
      horse: h.name || `${race.name}-${h.number}`,
      date: race.date!,
      venue: race.venue || undefined,
      surface: race.surface,
      ...(race.distance ? { distance: race.distance } : {}),
      ...(race.going ? { going: race.going } : {}),
      fieldSize: n,
      ...(f ? { first: rel(f, first.length), firstRank: f } : {}),
      ...(l ? { last: rel(l, final.length) } : {}),
      gate: rel(h.number, n),
      ...(k >= 0 ? { finish: k + 1 } : {}),
      source: "result" as const,
    };
  });
}

/**
 * 傾向を数えるための走りを集める。保存したレースの結果と、保存した馬柱の過去走 (通過順と着順があるもの)。
 * 同じ馬の同じ日の走りは1つにする (結果の方を優先)。
 */
export function collectRuns(races: Race[]): RunRecord[] {
  const out: RunRecord[] = [];
  const seen = new Set<string>();
  for (const race of races)
    for (const r of runsFromResults(race)) {
      seen.add(`${r.horse}|${r.date}`);
      out.push(r);
    }
  for (const [horse, runs] of horseHistories(races))
    for (const p of runs) {
      if (!p.date || !p.finish || seen.has(`${horse}|${p.date}`)) continue;
      const n = Math.max(p.fieldSize ?? 0, ...p.passing, 2);
      seen.add(`${horse}|${p.date}`);
      out.push({
        horse,
        date: p.date,
        ...(p.venue ? { venue: p.venue } : {}),
        ...(p.surface ? { surface: p.surface } : {}),
        ...(p.distance ? { distance: p.distance } : {}),
        ...(p.going ? { going: p.going } : {}),
        fieldSize: n,
        ...(p.passing.length > 0
          ? { first: rel(p.passing[0], n), firstRank: p.passing[0], last: rel(p.passing[p.passing.length - 1], n) }
          : {}),
        ...(p.gate ? { gate: rel(p.gate, n) } : {}),
        finish: p.finish,
        source: "history",
      });
    }
  return out;
}

export type StyleBucket = "逃げ" | "先行" | "差し" | "追込";
export const STYLE_BUCKETS: StyleBucket[] = ["逃げ", "先行", "差し", "追込"];
export type GateBucket = "内" | "中" | "外";
export const GATE_BUCKETS: GateBucket[] = ["内", "中", "外"];

/** 1コーナーの位置から脚質を決める (先頭は逃げ) */
export function styleBucket(r: RunRecord): StyleBucket | undefined {
  if (r.first === undefined) return undefined;
  if (r.firstRank === 1) return "逃げ";
  return r.first <= 0.34 ? "先行" : r.first <= 0.67 ? "差し" : "追込";
}

export function gateBucket(r: RunRecord): GateBucket | undefined {
  if (r.gate === undefined) return undefined;
  return r.gate <= 0.34 ? "内" : r.gate <= 0.67 ? "中" : "外";
}

export type GoingGroup = "良" | "道悪";
export const goingGroup = (g?: Going): GoingGroup | undefined => (g === undefined ? undefined : g === "良" ? "良" : "道悪");

export interface BucketStat {
  label: string;
  count: number; // 走った頭数
  top3: number;
  wins: number;
}

export interface Tendency {
  runs: number; // 数えた走り
  days: number; // 何日分か
  base: number; // 全体の3着内率
  styles: BucketStat[];
  gates: BucketStat[];
  front?: number; // 3着以内の馬の最終コーナーの位置の平均 (小さいほど前で決まる)
}

export interface TendencyFilter {
  venue?: string;
  surface?: "芝" | "ダ" | "障";
  distance?: number;
  going?: GoingGroup;
  date?: string;
}

export function filterRuns(runs: RunRecord[], f: TendencyFilter): RunRecord[] {
  return runs.filter(
    (r) =>
      (!f.venue || r.venue === f.venue) &&
      (!f.surface || !r.surface || r.surface === f.surface) &&
      (!f.distance || r.distance === f.distance) &&
      (!f.going || goingGroup(r.going) === f.going) &&
      (!f.date || r.date === f.date),
  );
}

/** 脚質別・枠別の3着内率 */
export function tendencyOf(runs: RunRecord[]): Tendency {
  const placed = (r: RunRecord) => r.finish !== undefined && r.finish <= 3;
  const tally = <T extends string>(labels: T[], of: (r: RunRecord) => T | undefined): BucketStat[] =>
    labels.map((label) => {
      const list = runs.filter((r) => of(r) === label);
      return { label, count: list.length, top3: list.filter(placed).length, wins: list.filter((r) => r.finish === 1).length };
    });
  const top = runs.filter((r) => placed(r) && r.last !== undefined);
  return {
    runs: runs.length,
    days: new Set(runs.map((r) => `${r.date}|${r.venue}`)).size,
    base: runs.length > 0 ? runs.filter(placed).length / runs.length : 0,
    styles: tally(STYLE_BUCKETS, styleBucket),
    gates: tally(GATE_BUCKETS, gateBucket),
    ...(top.length > 0 ? { front: top.reduce((s, r) => s + r.last!, 0) / top.length } : {}),
  };
}

export interface DayTendency {
  date: string;
  venue: string;
  runs: number;
  going?: Going;
  front?: number; // 3着以内の馬の最終コーナーの位置の平均
  frontDiff?: number; // その競馬場の普段との差 (プラスなら前で決まった)
  innerDiff?: number; // プラスなら内の馬が来た
  labels: string[];
}

const NOTABLE = 0.08;

/**
 * 競馬場の開催日ごとの傾向。3着以内の馬が最終コーナーでどこにいたか・どの枠だったかを、
 * その競馬場の普段 (全部の日) と比べる。3着以内の馬が3頭以上わかる日だけ。
 */
export function dayTendencies(runs: RunRecord[], venue: string): DayTendency[] {
  const atVenue = runs.filter((r) => r.venue === venue);
  const placed = atVenue.filter((r) => r.finish !== undefined && r.finish <= 3);
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const lasts = placed.filter((r) => r.last !== undefined).map((r) => r.last!);
  const gates = placed.filter((r) => r.gate !== undefined).map((r) => r.gate!);
  const baseFront = lasts.length >= 10 ? mean(lasts) : 0.3;
  const baseGate = gates.length >= 10 ? mean(gates) : 0.47;
  const byDay = new Map<string, RunRecord[]>();
  for (const r of atVenue) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const out: DayTendency[] = [];
  for (const [date, list] of byDay) {
    const top = list.filter((r) => r.finish !== undefined && r.finish <= 3);
    const tl = top.filter((r) => r.last !== undefined).map((r) => r.last!);
    const tg = top.filter((r) => r.gate !== undefined).map((r) => r.gate!);
    if (tl.length < 3 && tg.length < 3) continue;
    // 頭数が少ない日は控えめに
    const shrink = (k: number) => k / (k + 3);
    const frontDiff = tl.length >= 3 ? (baseFront - mean(tl)) * shrink(tl.length) : undefined;
    const innerDiff = tg.length >= 3 ? (baseGate - mean(tg)) * shrink(tg.length) : undefined;
    const going = list.find((r) => r.going)?.going;
    out.push({
      date,
      venue,
      runs: list.length,
      ...(going ? { going } : {}),
      ...(tl.length > 0 ? { front: mean(tl) } : {}),
      ...(frontDiff !== undefined ? { frontDiff } : {}),
      ...(innerDiff !== undefined ? { innerDiff } : {}),
      labels: [
        ...(frontDiff !== undefined && frontDiff >= NOTABLE ? ["前残り"] : frontDiff !== undefined && frontDiff <= -NOTABLE ? ["差し届く"] : []),
        ...(innerDiff !== undefined && innerDiff >= NOTABLE ? ["内有利"] : innerDiff !== undefined && innerDiff <= -NOTABLE ? ["外有利"] : []),
      ],
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** 当日のレースごとの、3着以内の馬の位置取りと馬番 */
export interface RaceSummary {
  name: string;
  distance?: number;
  surface?: string;
  top: { number: number; name: string; finish: number; finalRank?: number; firstRank?: number; fieldSize: number }[];
}

export function todaysRaces(races: Race[], date: string, venue: string): RaceSummary[] {
  return races
    .filter((r) => r.date === date && r.venue === venue && (r.result?.finish ?? "").split(",").filter(Boolean).length >= 3)
    .map((race) => {
      const order = race.result!.finish!.split(",").map(Number).filter(Boolean);
      const first = parseCornerNotation(race.result?.firstCorner ?? "", race.horses);
      const final = parseCornerNotation(race.result?.finalCorner ?? "", race.horses);
      const rank = (list: typeof first, n: number) => {
        const k = list.findIndex((p) => p.number === n);
        return k >= 0 ? k + 1 : undefined;
      };
      const n = race.horses.filter((h) => !h.scratched).length;
      return {
        name: race.name,
        ...(race.distance ? { distance: race.distance } : {}),
        surface: race.surface,
        top: order.slice(0, 3).map((num, k) => ({
          number: num,
          name: race.horses.find((h) => h.number === num)?.name ?? "",
          finish: k + 1,
          finalRank: rank(final, num),
          firstRank: rank(first, num),
          fieldSize: n,
        })),
      };
    })
    .sort((a, b) => raceNo(a.name) - raceNo(b.name));
}

const raceNo = (name: string) => Number(/(\d{1,2})R/.exec(name)?.[1] ?? 99);

/** 日付を YYYY-MM-DD にする (今日) */
export const todayIso = () => iso(new Date());
