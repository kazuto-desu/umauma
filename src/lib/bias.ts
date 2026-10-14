import { parseCornerNotation } from "./result";
import type { Race } from "./types";

export interface TrackBias {
  races: number; // 傾向を出すのに使った同じ日・同じ競馬場のレース数
  front: number; // プラスなら普段より前残り、マイナスなら差しが届く (0〜1 の物差しでのずれ)
  inner: number; // プラスなら普段より内枠が有利、マイナスなら外枠
  labels: string[]; // 例: ["前残り", "内有利"]
}

// 結果を集めた日がまだ少ないときの「普段」の目安
// (3着以内の馬の最終コーナーの位置: 0 = 先頭 〜 1 = 最後方、馬番: 0 = 最内 〜 1 = 大外)
const DEFAULT_BASE = { front: 0.32, inner: 0.47 };
const MIN_BASE_RACES = 8;
const NOTABLE = 0.06;

/** 1レースの3着以内の馬が、最終コーナーでどのあたりにいたか・何番だったか */
function topThreeOf(race: Race): { front: number; inner: number } | undefined {
  const order = (race.result?.finish ?? "").split(",").map(Number).filter(Boolean);
  const final = parseCornerNotation(race.result?.finalCorner ?? "", race.horses);
  const runners = race.horses.filter((h) => !h.scratched).length;
  if (order.length < 3 || final.length < 3 || runners < 4) return undefined;
  const top = order.slice(0, 3);
  const rankAt = (n: number) => final.findIndex((p) => p.number === n);
  const ranks = top.map(rankAt).filter((r) => r >= 0);
  if (ranks.length === 0) return undefined;
  return {
    front: ranks.reduce((s, r) => s + r / (final.length - 1), 0) / ranks.length,
    inner: top.reduce((s, n) => s + (n - 1) / (runners - 1), 0) / top.length,
  };
}

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/**
 * 同じ日・同じ競馬場の、結果を入れたレースから当日の馬場の傾向を出す。
 * 3着以内の馬が最終コーナーでどこにいたか・何番だったかを、普段 (保存したほかの日のレース) と比べる。
 * レース数が少ないうちは控えめに (1レースなら3分の1、2レースなら半分)。
 */
export function trackBias(saved: Race[], today: Race): TrackBias | undefined {
  if (!today.date || !today.venue) return undefined;
  const sameDay = saved.filter((r) => r.id !== today.id && r.date === today.date && r.venue === today.venue);
  const todays = sameDay.map(topThreeOf).filter((x): x is { front: number; inner: number } => !!x);
  if (todays.length === 0) return undefined;

  const others = saved.filter((r) => r.date !== today.date).map(topThreeOf).filter((x): x is { front: number; inner: number } => !!x);
  const base = others.length >= MIN_BASE_RACES ? { front: mean(others.map((x) => x.front)), inner: mean(others.map((x) => x.inner)) } : DEFAULT_BASE;

  const shrink = todays.length / (todays.length + 2);
  const front = (base.front - mean(todays.map((x) => x.front))) * shrink;
  const inner = (base.inner - mean(todays.map((x) => x.inner))) * shrink;
  const labels = [
    ...(front >= NOTABLE ? ["前残り"] : front <= -NOTABLE ? ["差しが届く"] : []),
    ...(inner >= NOTABLE ? ["内有利"] : inner <= -NOTABLE ? ["外有利"] : []),
  ];
  return { races: todays.length, front, inner, labels };
}
