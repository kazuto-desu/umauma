import type { Signal } from "./signals";
import type { RankedHorse } from "./verdict";

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

/**
 * 軸2頭・穴2頭・消し (出走頭数の3分の1) を選ぶ。オッズは使わない。
 *   軸: 材料の総合順位が上の馬から、消しの型に当てはまらない馬
 *   消し: 軸以外で、消しの型が多い馬 → 総合順位が下の馬
 *   穴: 軸・消し以外で、穴の型が多い馬 (足りなければ総合順位で補う)
 */
export function boardPicks(ranked: RankedHorse[], signals: Map<number, Signal[]>): BoardPicks {
  const n = ranked.length;
  if (n === 0) return { axis: [], ana: [], keshi: [] };
  const sigs = (x: number) => signals.get(x) ?? [];
  const count = (x: number, kind: Signal["kind"]) => sigs(x).filter((s) => s.kind === kind).length;
  const pos = new Map(ranked.map((r, k) => [r.number, k])); // 0 = 総合1位
  const pick = (r: RankedHorse, reasons: string[], filler = false): BoardPick => ({
    number: r.number,
    name: r.name,
    reasons,
    signals: sigs(r.number),
    ...(filler ? { filler } : {}),
  });

  const axisPool = ranked.filter((r) => count(r.number, "keshi") === 0);
  const axisList = (axisPool.length >= 2 ? axisPool : ranked).slice(0, 2);
  const axis = axisList.map((r) => pick(r, [`材料の総合${pos.get(r.number)! + 1}位/${n}頭`, ...r.reasons.slice(0, 3)]));
  const taken = new Set(axis.map((p) => p.number));

  const keshiCount = Math.max(1, Math.round(n / 3));
  const keshi = ranked
    .filter((r) => !taken.has(r.number))
    .sort((a, b) => count(b.number, "keshi") - count(a.number, "keshi") || pos.get(b.number)! - pos.get(a.number)!)
    .slice(0, keshiCount)
    .map((r) =>
      pick(r, [
        ...sigs(r.number)
          .filter((s) => s.kind === "keshi")
          .map((s) => `${s.label}: ${s.reason}`),
        `材料の総合${pos.get(r.number)! + 1}位/${n}頭`,
      ]),
    );
  keshi.forEach((p) => taken.add(p.number));

  const rest = ranked.filter((r) => !taken.has(r.number));
  const withAna = rest
    .filter((r) => count(r.number, "ana") > 0)
    .sort((a, b) => count(b.number, "ana") - count(a.number, "ana") || pos.get(a.number)! - pos.get(b.number)!);
  const ana = withAna.slice(0, 2).map((r) =>
    pick(r, sigs(r.number).filter((s) => s.kind === "ana").map((s) => `${s.label}: ${s.reason}`)),
  );
  for (const r of rest) {
    if (ana.length >= 2) break;
    if (ana.some((p) => p.number === r.number)) continue;
    ana.push(pick(r, [`次点: 材料の総合${pos.get(r.number)! + 1}位/${n}頭`, ...r.reasons.slice(0, 2)], true));
  }
  return { axis, ana, keshi };
}
