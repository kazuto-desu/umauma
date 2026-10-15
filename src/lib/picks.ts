import type { Signal, SignalStat } from "./signals";
import type { RankedHorse } from "./verdict";

/** 保存したレースでの型の効き目 */
export type SignalEffect = "proven" | "normal" | "weak";
const EFFECT_WEIGHT: Record<SignalEffect, number> = { proven: 2, normal: 1, weak: 0 };

/** 型の成績が判断できるだけたまったとみなす頭数 */
export const MIN_EFFECT_COUNT = 10;

/**
 * 型の成績から効き目を決める。出走馬全体の3着内率 (baseRate) と比べて
 *   軸・穴の型: 1.3倍以上なら実績あり、0.9倍以下なら効果薄
 *   消しの型: 0.6倍以下なら実績あり (本当に来ない)、1.0倍以上なら効果薄
 * 当てはまった馬が10頭に満たないうちは「ふつう」。
 */
export function effectOf(stat: SignalStat | undefined, baseRate: number | undefined): SignalEffect {
  if (!stat || baseRate === undefined || baseRate <= 0 || stat.count < MIN_EFFECT_COUNT) return "normal";
  const lift = stat.top3 / stat.count / baseRate;
  if (stat.kind !== "keshi") return lift >= 1.3 ? "proven" : lift <= 0.9 ? "weak" : "normal";
  return lift <= 0.6 ? "proven" : lift >= 1.0 ? "weak" : "normal";
}

export interface BoardPick {
  number: number;
  name: string;
  reasons: string[];
  signals: Signal[];
  filler?: boolean; // 型に当てはまる馬が足りず、総合の順位で補った
}

export interface BoardPicks {
  axis: BoardPick[]; // 軸候補 (2頭)
  ana: BoardPick[]; // 穴候補 (2頭)
  keshi: BoardPick[]; // 消し候補 (出走頭数の3分の1)
}

/** 軸の選び方: 総合上位4頭の中で軸の型が多い馬を優先する / 総合順位だけで選ぶ */
export type AxisMode = "types" | "rank";

/** 軸の型で選ぶときに対象にする総合順位の範囲 */
export const AXIS_RANGE = 4;

/**
 * 軸2頭・穴2頭・消し (出走頭数の3分の1) を選ぶ。オッズは使わない。
 *   軸: 消しの型に当てはまらない馬のうち、総合上位4頭の中で軸の型が多い馬 → 総合順位が上の馬
 *       (axisMode が "rank" なら総合順位だけで選ぶ)
 *   消し: 軸以外で、消しの型が多い馬 → 総合順位が下の馬。軸・穴の型が消しの型と同じか多い馬は入れない
 *   穴: 軸・消し以外で、穴の型が消しの型より多い馬 (足りなければ総合順位で補う)
 * 型は保存したレースでの効き目 (effect) で重み付けする: 実績ありは2頭分、効果薄は数えない。
 */
export function boardPicks(
  ranked: RankedHorse[],
  signals: Map<number, Signal[]>,
  effect: (key: string) => SignalEffect = () => "normal",
  axisMode: AxisMode = "types",
): BoardPicks {
  const n = ranked.length;
  if (n === 0) return { axis: [], ana: [], keshi: [] };
  const sigs = (x: number) => signals.get(x) ?? [];
  // 型の重み: 実績のある型は2、ふつうは1、効果の薄い型は0 (候補選びに使わない)
  const count = (x: number, kind: Signal["kind"]) =>
    sigs(x)
      .filter((s) => s.kind === kind)
      .reduce((sum, s) => sum + EFFECT_WEIGHT[effect(s.key)], 0);
  const pos = new Map(ranked.map((r, k) => [r.number, k])); // 0 = 総合1位
  const pick = (r: RankedHorse, reasons: string[], filler = false): BoardPick => ({
    number: r.number,
    name: r.name,
    reasons,
    signals: sigs(r.number),
    ...(filler ? { filler } : {}),
  });

  const total = (r: RankedHorse) => `材料の総合${pos.get(r.number)! + 1}位/${n}頭`;
  const axisPool = ranked.filter((r) => count(r.number, "keshi") === 0);
  // 総合が下位の馬は、軸の型があっても軸にしない (型だけで上位の馬を飛び越えないように)
  const withAxis = axisPool
    .filter((r) => axisMode === "types" && pos.get(r.number)! < AXIS_RANGE && count(r.number, "axis") > 0)
    .sort((a, b) => count(b.number, "axis") - count(a.number, "axis") || pos.get(a.number)! - pos.get(b.number)!);
  const axis = withAxis.slice(0, 2).map((r) =>
    pick(r, [...sigs(r.number).filter((s) => s.kind === "axis").map((s) => `${s.label}: ${s.reason}`), total(r)]),
  );
  // 軸の型がある馬が足りなければ、総合順位が上の馬で補う
  for (const r of axisPool.length >= 2 ? axisPool : ranked) {
    if (axis.length >= 2) break;
    if (axis.some((p) => p.number === r.number)) continue;
    const own = sigs(r.number).filter((s) => s.kind === "axis").map((s) => `${s.label}: ${s.reason}`);
    axis.push(pick(r, [total(r), ...own, ...r.reasons.slice(0, 3)], axisMode === "types"));
  }
  const taken = new Set(axis.map((p) => p.number));
  // 軸・穴の型 (買いの材料) の数
  const plus = (x: number) => count(x, "axis") + count(x, "ana");

  const keshiCount = Math.max(1, Math.round(n / 3));
  // 軸・穴の型が消しの型と同じか多い馬は消しにしない (足りなければ消しは少なめに出す)
  const keshi = ranked
    .filter((r) => !taken.has(r.number))
    .filter((r) => plus(r.number) === 0 || count(r.number, "keshi") > plus(r.number))
    // 消しの型が多い順。同じなら軸・穴の型がない馬を先に、それも同じなら総合が下の馬から
    .sort(
      (a, b) =>
        count(b.number, "keshi") - count(a.number, "keshi") ||
        plus(a.number) - plus(b.number) ||
        pos.get(b.number)! - pos.get(a.number)!,
    )
    .slice(0, keshiCount)
    .map((r) =>
      pick(r, [
        ...sigs(r.number)
          .filter((s) => s.kind === "keshi")
          .map((s) => `${s.label}: ${s.reason}`),
        total(r),
      ]),
    );
  keshi.forEach((p) => taken.add(p.number));

  const rest = ranked.filter((r) => !taken.has(r.number));
  // 消しの型の方が多い馬は穴にしない
  const withAna = rest
    .filter((r) => count(r.number, "ana") > count(r.number, "keshi"))
    .sort((a, b) => count(b.number, "ana") - count(a.number, "ana") || pos.get(a.number)! - pos.get(b.number)!);
  const ana = withAna.slice(0, 2).map((r) =>
    pick(r, sigs(r.number).filter((s) => s.kind === "ana").map((s) => `${s.label}: ${s.reason}`)),
  );
  for (const r of rest) {
    if (ana.length >= 2) break;
    if (ana.some((p) => p.number === r.number)) continue;
    if (count(r.number, "keshi") > count(r.number, "ana")) continue; // 消しの型の方が多い馬は次点にもしない
    ana.push(pick(r, [`次点: ${total(r)}`, ...r.reasons.slice(0, 2)], true));
  }
  return { axis, ana, keshi };
}
