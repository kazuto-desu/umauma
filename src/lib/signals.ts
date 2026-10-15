import { readComment } from "./comment";
import { pastDate } from "./conditions";
import { classOf } from "./form";
import { readPaddock } from "./paddock";
import { predict } from "./predict";
import { lapShape, latestWorkout, parsePartner, risingOf, scoreWorkout } from "./training";
import type { PredictOptions, Prediction, Race } from "./types";

export type SignalKind = "axis" | "ana" | "keshi";

/** 軸・穴・消しの型。key ごとに保存したレースでの成績を集める */
export interface Signal {
  kind: SignalKind;
  key: string;
  label: string; // 型の名前 (例: 前走は負けたが内容良)
  reason: string; // この馬で当てはまった理由
}

export const SIGNAL_TYPES: { kind: SignalKind; key: string; label: string; note: string }[] = [
  { kind: "axis", key: "stableForm", label: "好走安定", note: "近3走のうち2走以上で3着内" },
  { kind: "axis", key: "classProven", label: "クラス実績", note: "今回と同じか上のクラスで3着内がある" },
  { kind: "axis", key: "courseProven", label: "コース実績", note: "同じ競馬場・近い距離で3着内がある" },
  { kind: "axis", key: "topTraining", label: "調教上位", note: "最終追い切りの時計がメンバー上位3頭" },
  { kind: "axis", key: "goodCondition", label: "状態良好", note: "厩舎が前向き／パドック評価が高い (悪い材料なし)" },
  { kind: "ana", key: "goodLoss", label: "前走は負けたが内容良", note: "着差が小さい／ハイペースを先行して粘った" },
  { kind: "ana", key: "trainingJump", label: "調教で一変", note: "前走前より大きく時計を詰めた・矢印↑" },
  { kind: "ana", key: "better", label: "条件好転", note: "降級・斤量減" },
  { kind: "ana", key: "secondStart", label: "叩き2戦目", note: "休み明けを1回使った次" },
  { kind: "ana", key: "loneLeader", label: "単騎逃げ", note: "逃げ馬がこの馬だけ" },
  { kind: "ana", key: "paceCloser", label: "展開が向く差し", note: "ハイペース濃厚で末脚がある" },
  { kind: "keshi", key: "badTraining", label: "調子が悪い", note: "時計が出ていない・失速・併せ遅れ" },
  { kind: "keshi", key: "badState", label: "状態に不安", note: "厩舎が体調不安・調整不足・弱気／パドック不良" },
  { kind: "keshi", key: "worse", label: "条件悪化", note: "昇級と斤量増が重なる" },
  { kind: "keshi", key: "bigLosses", label: "大敗続き", note: "近走ずっと2秒以上負け" },
  { kind: "keshi", key: "paceBad", label: "展開が向かない", note: "追込馬でスロー・前残り馬場 (後ろからの馬が少ないレース)" },
  { kind: "keshi", key: "freshUnready", label: "休み明けで仕上がり途上", note: "長い休み明けで調教も平凡" },
];

const LABEL = new Map(SIGNAL_TYPES.map((t) => [t.key, t]));
const sig = (key: string, reason: string): Signal => {
  const t = LABEL.get(key)!;
  return { kind: t.kind, key, label: t.label, reason };
};

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

/**
 * 出走馬ごとに、軸にしやすい型・穴になりやすい型・消しになりやすい型を拾う。
 * どれも「当てはまったら買い・消し」ではなく、判断の取っかかりとして見せるための目安。
 */
export function signalsOf(race: Race, prediction: Prediction, bias?: { front: number }): Map<number, Signal[]> {
  const runners = race.horses.filter((h) => !h.scratched);
  const out = new Map<number, Signal[]>();
  const analyses = new Map(prediction.analyses.map((a) => [a.number, a]));
  const leaders = prediction.analyses.filter((a) => a.style === "逃げ");
  const today = race.date ? new Date(`${race.date}T00:00:00`) : undefined;
  const todayClass = classOf(race.raceClass || race.name);

  // 調教の時計の順位 (上位半分かどうか)
  const lapScores = runners
    .map((h) => {
      const w = latestWorkout(h.workouts);
      return { n: h.number, s: w ? scoreWorkout(w)?.score : undefined };
    })
    .filter((x): x is { n: number; s: number } => x.s !== undefined)
    .sort((a, b) => a.s - b.s);
  const lapUpperHalf = (n: number) => {
    const k = lapScores.findIndex((x) => x.n === n);
    return k >= 0 && k < Math.ceil(lapScores.length / 2);
  };

  const lapTop3 = (n: number) => {
    const k = lapScores.findIndex((x) => x.n === n);
    return k >= 0 && k < 3 && lapScores.length >= 4;
  };

  for (const h of runners) {
    const list: Signal[] = [];
    const a = analyses.get(h.number);
    const [last, prev] = h.pastRaces;
    const lastDate = pastDate(last?.date, race.date);
    const gap = lastDate && today ? daysBetween(lastDate, today) : undefined;

    // ---- 軸の型 ----
    const recent3 = h.pastRaces.slice(0, 3).filter((r) => r.finish);
    const placed = recent3.filter((r) => r.finish! <= 3);
    if (recent3.length >= 2 && placed.length >= 2)
      list.push(sig("stableForm", `近${recent3.length}走で${recent3.map((r) => `${r.finish}着`).join("・")}`));

    const classRun = todayClass
      ? h.pastRaces.slice(0, 6).find((r) => r.finish && r.finish <= 3 && r.classLevel !== undefined && r.classLevel >= todayClass.level - 0.4)
      : undefined;
    if (classRun) list.push(sig("classProven", `${classRun.className ?? "同クラス以上"}で${classRun.finish}着`));

    const courseRun = race.venue
      ? h.pastRaces.find(
          (r) => r.finish && r.finish <= 3 && r.venue === race.venue && r.distance && race.distance && Math.abs(r.distance - race.distance) <= 100,
        )
      : undefined;
    if (courseRun) list.push(sig("courseProven", `${courseRun.venue}${courseRun.distance}mで${courseRun.finish}着`));

    if (lapTop3(h.number)) list.push(sig("topTraining", `最終追い切りの時計がメンバー${lapScores.findIndex((x) => x.n === h.number) + 1}位`));

    // 状態の良し悪しは厩舎コメントとパドックから (悪い材料があるときは出さない)
    const talkRead = h.stableComment ? readComment(h.stableComment) : undefined;
    const pdRead = h.paddock ? readPaddock(h.paddock) : undefined;
    const goodTalk = talkRead && talkRead.mood > 0 ? talkRead.tags.filter((t) => /状態良好|攻め気配良|仕上がり良|順調|前向きな談話|復調気配/.test(t)) : [];
    const goodPaddock = pdRead && pdRead.score >= 0.8 ? pdRead.tags.filter((t) => /^評価|仕上がり良|気合十分|上昇気配/.test(t)) : [];
    if (goodTalk.length + goodPaddock.length > 0)
      list.push(sig("goodCondition", [...goodTalk.map((t) => `厩舎: ${t}`), ...goodPaddock.map((t) => `パドック: ${t}`)].join("・")));

    // ---- 穴の型 ----
    if (last?.finish && last.finish >= 4) {
      const close = last.margin !== undefined && last.margin <= 0.5;
      const fieldSize = last.fieldSize ?? 12;
      const ranFront = last.passing.length > 0 && last.passing[0] <= Math.max(2, Math.round(fieldSize * 0.25));
      const hardPace = last.pace === "H" && ranFront;
      if (close) list.push(sig("goodLoss", `前走${last.finish}着でも勝ち馬と${last.margin}秒差`));
      else if (hardPace) list.push(sig("goodLoss", `前走はハイペースを${last.passing[0]}番手で先行`));
    }
    const rise = risingOf(h.workouts, h.trainingTrend, h.trainingComment);
    if (rise && rise.score >= 0.5) list.push(sig("trainingJump", rise.reasons[0] ?? "調教の上昇度が大きい"));

    const prevClass = h.pastRaces.find((r) => r.classLevel !== undefined);
    const down = todayClass && prevClass?.classLevel !== undefined && todayClass.level < prevClass.classLevel - 0.4;
    const up = todayClass && prevClass?.classLevel !== undefined && todayClass.level > prevClass.classLevel + 0.4;
    const weightDiff = h.carried && last?.carried ? h.carried - last.carried : 0;
    const better = [down ? `降級 (前走${prevClass!.className ?? ""})` : "", weightDiff <= -1 ? `斤量${weightDiff}kg` : ""].filter(Boolean);
    if (better.length > 0) list.push(sig("better", better.join("・")));

    const prevDate = pastDate(prev?.date, race.date);
    if (lastDate && prevDate && gap !== undefined && daysBetween(prevDate, lastDate) >= 84 && gap <= 63)
      list.push(sig("secondStart", `休み明けを${last!.finish ? `${last!.finish}着で` : ""}1回使った`));

    if (a?.style === "逃げ" && leaders.length === 1) list.push(sig("loneLeader", "逃げ候補がこの馬だけ"));
    if (prediction.pace === "ハイ" && (a?.style === "差し" || a?.style === "追込") && (a.closing === "S" || a.closing === "A"))
      list.push(sig("paceCloser", `ハイペース想定で末脚${a.closing}`));

    // ---- 消しの型 ----
    const w = latestWorkout(h.workouts);
    const badTrain = [
      a?.condition && a.condition.value >= 0.25 ? "時計が出ていない" : "",
      w && lapShape(w) === "失速" ? "最終追い切りが失速" : "",
      w?.partner && parsePartner(w.partner).result === "遅れ" ? "併せ遅れ" : "",
      h.trainingTrend === "↓" ? "調教欄の矢印↓" : "",
    ].filter(Boolean);
    if (badTrain.length > 0) list.push(sig("badTraining", badTrain.join("・")));

    const badTalk = talkRead?.tags.filter((t) => /体調面の不安|調整不足|弱気|状態一息|太め/.test(t)) ?? [];
    const badPaddock = pdRead?.tags.filter((t) => /イレ込み|発汗|太め|細め|一息/.test(t)) ?? [];
    if (badTalk.length + badPaddock.length > 0)
      list.push(sig("badState", [...badTalk.map((t) => `厩舎: ${t}`), ...badPaddock.map((t) => `パドック: ${t}`)].join("・")));

    if (up && weightDiff >= 1) list.push(sig("worse", `昇級 (前走${prevClass!.className ?? ""})・斤量+${weightDiff}kg`));

    const recent = h.pastRaces.slice(0, 3).filter((r) => r.margin !== undefined);
    if (recent.length >= 2 && recent.every((r) => r.margin! >= 2))
      list.push(sig("bigLosses", `近${recent.length}走すべて${Math.min(...recent.map((r) => r.margin!))}秒以上負け`));

    // 後ろからの馬が半分以上いるレースでは不利の差がつきにくいので出さない
    const closers = prediction.analyses.filter((x) => x.style === "差し" || x.style === "追込").length;
    if (
      a?.style === "追込" &&
      a.closing !== "S" &&
      closers < prediction.analyses.length / 2 &&
      (prediction.pace === "スロー" || (bias && bias.front >= 0.06))
    )
      list.push(sig("paceBad", prediction.pace === "スロー" ? "スローペース想定で後ろから" : "今日は前残り馬場で後ろから"));

    if (gap !== undefined && gap >= 84 && !lapUpperHalf(h.number))
      list.push(sig("freshUnready", `${Math.floor(gap / 30)}か月ぶりで調教も上位でない`));

    out.set(h.number, list);
  }
  return out;
}

export interface SignalStat {
  key: string;
  label: string;
  kind: SignalKind;
  count: number; // 当てはまった延べ頭数
  top3: number; // そのうち3着以内
  wins: number;
  oddsCount: number; // オッズが入っていた頭数
  returnRate?: number; // 単勝を100円ずつ買ったときの回収率 (%)
}

/**
 * 保存したレース (着順のあるもの) で、型ごとに当てはまった馬の成績を数える。
 * venue を渡すとその競馬場だけ。
 */
export function signalStats(races: Race[], options: PredictOptions, venue?: string): { races: number; stats: SignalStat[] } {
  const acc = new Map<string, { count: number; top3: number; wins: number; oddsCount: number; paid: number }>();
  let used = 0;
  for (const race of races) {
    if (venue && race.venue !== venue) continue;
    const finish = (race.result?.finish ?? "").split(",").map(Number).filter(Boolean);
    if (finish.length < 3) continue;
    used++;
    const signals = signalsOf(race, predict(race, options));
    for (const h of race.horses) {
      for (const s of signals.get(h.number) ?? []) {
        const a = acc.get(s.key) ?? { count: 0, top3: 0, wins: 0, oddsCount: 0, paid: 0 };
        a.count++;
        if (finish.slice(0, 3).includes(h.number)) a.top3++;
        if (finish[0] === h.number) a.wins++;
        if (h.odds) {
          a.oddsCount++;
          if (finish[0] === h.number) a.paid += h.odds * 100;
        }
        acc.set(s.key, a);
      }
    }
  }
  const stats = SIGNAL_TYPES.map((t) => {
    const a = acc.get(t.key) ?? { count: 0, top3: 0, wins: 0, oddsCount: 0, paid: 0 };
    return {
      key: t.key,
      label: t.label,
      kind: t.kind,
      count: a.count,
      top3: a.top3,
      wins: a.wins,
      oddsCount: a.oddsCount,
      ...(a.oddsCount > 0 ? { returnRate: Math.round(a.paid / a.oddsCount) } : {}),
    };
  });
  return { races: used, stats };
}

/** 保存したレースの印と比べるための、出走馬全体の3着内率 (型の成績の比べる目安) */
export function baseTop3Rate(races: Race[], venue?: string): number | undefined {
  let horses = 0;
  let top3 = 0;
  for (const race of races) {
    if (venue && race.venue !== venue) continue;
    const finish = (race.result?.finish ?? "").split(",").map(Number).filter(Boolean);
    if (finish.length < 3) continue;
    const runners = race.horses.filter((h) => !h.scratched).length;
    horses += runners;
    top3 += Math.min(3, runners);
  }
  return horses > 0 ? top3 / horses : undefined;
}

