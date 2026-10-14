import { useState } from "react";
import { readComment } from "../lib/comment";
import { fieldClass, formOf } from "../lib/form";
import { frameColor } from "../lib/frame";
import { MY_MARKS } from "../lib/myMarks";
import { readPaddock } from "../lib/paddock";
import { lapShape, latestWorkout, parsePartner, risingOf, scoreWorkout } from "../lib/training";
import type { Horse, MyMark, PastRace, Placement, Prediction, Workout } from "../lib/types";

type SortKey = "number" | "final" | "lap" | "rise" | "form" | "mark";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "number", label: "馬番" },
  { key: "final", label: "4角の位置" },
  { key: "lap", label: "調教の時計" },
  { key: "rise", label: "調子の上昇" },
  { key: "form", label: "近走成績" },
  { key: "mark", label: "自分の印" },
];

interface Tag {
  text: string;
  tone?: "good" | "bad";
}

/** 隊列の何番手か (先頭からの距離、同じなら内から) */
function ranks(placements: Placement[]): Map<number, number> {
  return new Map([...placements].sort((a, b) => a.x - b.x || a.lane - b.lane).map((p, k) => [p.number, k + 1]));
}

/** 追い切りの時計を "66.7-52.0-38.6-12.4" のように */
const timesOf = (w: Workout) =>
  [...w.marks]
    .sort((a, b) => b.furlong - a.furlong)
    .map((m) => m.time.toFixed(1))
    .join("-");

/**
 * 読み取った材料を馬ごとに並べて見比べる表。点数や順位にはまとめず、良い材料は緑・気になる材料は赤で示す。
 * 自分で印を付けられる。
 */
export function ComparisonTable({
  horses,
  prediction,
  offsetOf,
  onHorses,
}: {
  horses: Horse[];
  prediction: Prediction;
  offsetOf: (w: Workout) => number;
  onHorses: (h: Horse[]) => void;
}) {
  const [sort, setSort] = useState<SortKey>("number");
  const runners = horses.filter((h) => !h.scratched);
  const first = ranks(prediction.firstCorner);
  const final = ranks(prediction.finalCorner);
  const analysisOf = (n: number) => prediction.analyses.find((a) => a.number === n);

  const lapScore = new Map(
    runners.map((h) => {
      const w = latestWorkout(h.workouts);
      return [h.number, w ? scoreWorkout(w, offsetOf(w)) : undefined] as const;
    }),
  );
  const lapOrder = [...lapScore].filter(([, s]) => s).sort((a, b) => a[1]!.score - b[1]!.score).map(([n]) => n);
  const rising = new Map(runners.map((h) => [h.number, risingOf(h.workouts, h.trainingTrend, h.trainingComment)]));
  const refClass = fieldClass(runners);
  const form = new Map(runners.map((h) => [h.number, formOf(h.pastRaces, refClass)]));

  // 並べ替え (値のない馬は後ろ)
  const keyOf = (h: Horse): number | undefined => {
    switch (sort) {
      case "number":
        return h.number;
      case "final":
        return final.get(h.number);
      case "lap":
        return lapScore.get(h.number)?.score;
      case "rise":
        return rising.get(h.number) ? -rising.get(h.number)!.score : undefined;
      case "form":
        return form.get(h.number);
      case "mark":
        return h.myMark ? MY_MARKS.indexOf(h.myMark) : undefined;
    }
  };
  const sorted = [...runners].sort((a, b) => {
    const x = keyOf(a);
    const y = keyOf(b);
    if (x === undefined && y === undefined) return a.number - b.number;
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return x - y || a.number - b.number;
  });

  const setMark = (n: number, mark: MyMark | undefined) => {
    onHorses(
      horses.map((h) => {
        if (h.number === n) return mark ? { ...h, myMark: mark } : (({ myMark: _, ...rest }) => rest)(h);
        // ◎○▲ は1頭ずつ。同じ印を別の馬に付けたら前の馬からは外す
        if (mark && (mark === "◎" || mark === "○" || mark === "▲") && h.myMark === mark) return (({ myMark: _, ...rest }) => rest)(h);
        return h;
      }),
    );
  };

  return (
    <section className="card compare">
      <h2>出走馬の比較</h2>
      <p className="muted">読み取った材料を並べています。良い材料は緑、気になる材料は赤。印は自分で付けてください (「消」は買わない馬)。</p>
      <label className="field inline">
        並べ替え
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <ol className="compare-list">
        {sorted.map((h) => {
          const a = analysisOf(h.number);
          const c = frameColor(h.frame);
          const w = latestWorkout(h.workouts);
          const lap = lapScore.get(h.number);
          const lapRank = lapOrder.indexOf(h.number) + 1;
          const shape = w ? lapShape(w) : undefined;
          const partner = w?.partner ? parsePartner(w.partner) : undefined;
          const rise = rising.get(h.number);
          const talk = h.stableComment ? readComment(h.stableComment) : undefined;
          const pd = h.paddock ? readPaddock(h.paddock) : undefined;

          const shapeTags: Tag[] = [];
          if (a && a.style !== "不明") shapeTags.push({ text: a.style });
          if (a?.advantage === "有利" || a?.advantage === "やや有利") shapeTags.push({ text: `展開${a.advantage}`, tone: "good" });
          if (a?.advantage === "不利" || a?.advantage === "やや不利") shapeTags.push({ text: `展開${a.advantage}`, tone: "bad" });
          if (a?.closing === "S") shapeTags.push({ text: "末脚上位", tone: "good" });

          const trainTags: Tag[] = [];
          if (lap && lapRank > 0) trainTags.push({ text: `時計${lapRank}位/${lapOrder.length}頭`, tone: lapRank <= 3 ? "good" : undefined });
          if (shape) trainTags.push({ text: shape, tone: shape === "加速" ? "good" : shape === "失速" ? "bad" : undefined });
          if (partner?.result) trainTags.push({ text: `併せ${partner.result}`, tone: partner.result === "先着" ? "good" : partner.result === "遅れ" ? "bad" : undefined });
          if (rise) for (const r of rise.reasons) trainTags.push({ text: r, tone: rise.score > 0 ? "good" : rise.score < 0 ? "bad" : undefined });
          if (a?.condition && a.condition.value >= 0.25) trainTags.push({ text: "時計が出ていない", tone: "bad" });

          return (
            <li key={h.number} className={h.myMark === "消" ? "erased" : h.myMark ? "marked" : undefined}>
              <div className="compare-head">
                <span className="frame-badge" style={{ background: c.bg, color: c.fg }}>
                  {h.number}
                </span>
                <strong>{h.name || "(馬名なし)"}</strong>
                <span className="muted">{h.jockey ?? ""}</span>
              </div>
              <div className="mark-buttons" role="group" aria-label="自分の印">
                {MY_MARKS.map((m) => (
                  <button
                    key={m}
                    className={h.myMark === m ? (m === "消" ? "on erase" : "on") : "ghost"}
                    onClick={() => setMark(h.number, h.myMark === m ? undefined : m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <dl className="compare-rows">
                <dt>展開</dt>
                <dd>
                  {first.get(h.number) ? `1角${first.get(h.number)}番手 → 4角${final.get(h.number)}番手` : "過去の通過順なし"}
                  <Tags tags={shapeTags} />
                </dd>
                <dt>調教</dt>
                <dd>
                  {w ? (
                    <>
                      <span className="compare-sub">
                        {[w.date, w.course, w.intensity].filter(Boolean).join(" ")} {timesOf(w)}
                      </span>
                      {(h.trainingComment || h.trainingTrend) && (
                        <span className="compare-sub">
                          短評: {h.trainingComment ?? ""} {h.trainingTrend ?? ""}
                        </span>
                      )}
                    </>
                  ) : (
                    "調教データなし"
                  )}
                  <Tags tags={trainTags} />
                </dd>
                <dt>近走</dt>
                <dd>{h.pastRaces.length === 0 ? "過去走なし" : <RecentRaces races={h.pastRaces.slice(0, 3)} />}</dd>
                {talk && (
                  <>
                    <dt>厩舎</dt>
                    <dd>
                      <Tags
                        tags={talk.tags.map((t) => ({
                          text: t,
                          tone: /不安|課題|叩き台|太め|休み明け|一息|弱気/.test(t) ? "bad" : /意向/.test(t) ? undefined : "good",
                        }))}
                      />
                      <details className="compare-text">
                        <summary>コメント</summary>
                        {h.stableComment}
                      </details>
                    </dd>
                  </>
                )}
                {pd && (
                  <>
                    <dt>パドック</dt>
                    <dd>
                      {h.paddock!.weight ? (
                        <span className="compare-sub">
                          {h.paddock!.weight}kg ({h.paddock!.weightDiff! > 0 ? "+" : ""}
                          {h.paddock!.weightDiff}) {h.paddock!.comment ?? ""}
                        </span>
                      ) : null}
                      <Tags
                        tags={pd.tags.map((t) => ({
                          text: t,
                          tone: /イレ込み|発汗|太め|細め|一息|馬体重/.test(t) ? "bad" : /評価(S|A)|気配|良|気合|好材料/.test(t) ? "good" : undefined,
                        }))}
                      />
                    </dd>
                  </>
                )}
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Tags({ tags }: { tags: Tag[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="tags">
      {tags.map((t, k) => (
        <span key={k} className={`tag${t.tone ? ` ${t.tone}` : ""}`}>
          {t.text}
        </span>
      ))}
    </span>
  );
}

/** 近走を馬柱のような表で (新しい順) */
function RecentRaces({ races }: { races: PastRace[] }) {
  return (
    <table className="recent">
      <thead>
        <tr>
          <th>日付・場</th>
          <th>条件</th>
          <th>着順</th>
          <th>着差</th>
          <th>通過</th>
          <th>上3F</th>
        </tr>
      </thead>
      <tbody>
        {races.map((r, k) => (
          <tr key={k}>
            <td>
              {r.date ?? ""}
              {r.venue ? <span className="recent-sub">{r.venue}</span> : null}
            </td>
            <td>
              {r.className ?? ""}
              <span className="recent-sub">{r.surface && r.distance ? `${r.surface}${r.distance}` : ""}</span>
            </td>
            <td className={`recent-finish${r.finish === 1 ? " win" : r.finish && r.finish <= 3 ? " place" : ""}`}>
              {r.finish ? (
                <>
                  {r.finish}
                  <span className="recent-sub">/{r.fieldSize ?? "?"}頭</span>
                </>
              ) : (
                "－"
              )}
            </td>
            <td>{r.margin === undefined ? "－" : r.finish === 1 ? "勝ち" : `${r.margin}秒`}</td>
            <td>{r.passing.length ? r.passing.join("-") : "－"}</td>
            <td>{r.last3f ?? "－"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
