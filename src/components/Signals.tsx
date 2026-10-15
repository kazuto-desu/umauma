import { frameColor } from "../lib/frame";
import { SIGNAL_TYPES } from "../lib/signals";
import { AXIS_RANGE, MIN_EFFECT_COUNT } from "../lib/picks";
import type { AxisMode, BoardPick, BoardPicks, SignalEffect } from "../lib/picks";
import { MIN_AXIS_RACES } from "../lib/pickRecord";
import type { MaterialKey, PickRecord, Tally } from "../lib/pickRecord";
import type { AxisLearnResult } from "../lib/markLearn";

const MATERIAL_LABEL: Record<MaterialKey, string> = {
  goal: "展開 (ゴール前の想定位置)",
  form: "近走の成績",
  lap: "調教の時計",
  rise: "調子の上昇度",
  talk: "厩舎コメント",
  paddock: "パドック",
};
const pct100 = (v: number) => `${Math.round(v * 100)}%`;
import type { Signal, SignalKind, SignalStat } from "../lib/signals";
import type { Horse } from "../lib/types";

const KIND_CHAR: Record<SignalKind, string> = { axis: "軸", ana: "穴", keshi: "消" };
const KIND_NAME: Record<SignalKind, string> = { axis: "軸の型", ana: "穴の型", keshi: "消しの型" };

const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;

/** 型の成績を短く (例: 複勝率38% 12頭)。数が少ないうちは「データ不足」 */
export function statText(stat: SignalStat | undefined): string {
  if (!stat || stat.count === 0) return "成績データなし";
  if (stat.count < 5) return `${stat.count}頭・データ不足`;
  return `3着内${pct(stat.top3, stat.count)}・${stat.count}頭`;
}

/** 1つの型のバッジ */
export function SignalChip({ signal, stat, effect = "normal" }: { signal: Signal; stat?: SignalStat; effect?: SignalEffect }) {
  return (
    <span className={`signal-chip ${signal.kind} effect-${effect}`} title={signal.reason}>
      <span className="signal-kind">{KIND_CHAR[signal.kind]}</span>
      <span className="signal-label">{signal.label}</span>
      {stat && stat.count >= 5 && <span className="signal-stat">{pct(stat.top3, stat.count)}</span>}
      {effect === "proven" && <span className="signal-effect">★実績</span>}
      {effect === "weak" && <span className="signal-effect">効果薄</span>}
    </span>
  );
}

/**
 * 軸候補2頭・穴候補2頭・消し候補 (出走頭数の3分の1) のボード。理由と型の成績つき。
 * オッズは使わずに選ぶ。人気は「人気を見る」を押したときだけ添える。
 */
export function SignalBoard({
  horses,
  picks,
  stats,
  popularity,
  effect,
  scope,
  axisMode = "types",
}: {
  horses: Horse[];
  axisMode?: AxisMode;
  picks: BoardPicks;
  stats: Map<string, SignalStat>;
  popularity?: Map<number, number>;
  effect: (key: string) => SignalEffect;
  scope: string; // 型の成績を集めた範囲 (例: 川崎)
}) {
  if (picks.axis.length + picks.ana.length + picks.keshi.length === 0) return null;
  const frameOf = (n: number) => horses.find((h) => h.number === n)?.frame ?? 0;

  const Row = ({ p, kind }: { p: BoardPick; kind: "axis" | "ana" | "keshi" }) => {
    const c = frameColor(frameOf(p.number));
    const pop = popularity?.get(p.number);
    // その列の型を先に、反対の型 (穴候補の消しの型など) も隠さずに並べる
    const chips = [...p.signals].sort((a, b) => Number(b.kind === kind) - Number(a.kind === kind));
    return (
      <li>
        <div className="board-horse">
          <span className="frame-badge small" style={{ background: c.bg, color: c.fg }}>
            {p.number}
          </span>
          <strong>{p.name}</strong>
          {p.filler && <span className="filler-tag">次点</span>}
          {pop !== undefined && <span className={`pop-badge${pop >= 6 ? " long" : ""}`}>{pop}番人気</span>}
        </div>
        {chips.length > 0 && (
          <div className="signal-row">
            {chips.map((s) => (
              <SignalChip key={s.key} signal={s} stat={stats.get(s.key)} effect={effect(s.key)} />
            ))}
          </div>
        )}
        <ul className="board-reasons">
          {p.reasons.slice(0, 3).map((r) => (
            <li key={r} className="board-reason">
              {r}
            </li>
          ))}
        </ul>
      </li>
    );
  };

  const Col = ({ kind, title, list, note }: { kind: "axis" | "ana" | "keshi"; title: string; list: BoardPick[]; note: string }) => (
    <div className={`board-col ${kind}`}>
      <h3>
        {title} <span className="board-count">{list.length}頭</span>
      </h3>
      <p className="board-note">{note}</p>
      {list.length === 0 ? (
        <p className="muted">該当なし</p>
      ) : (
        <ul className="board-list">
          {list.map((p) => (
            <Row key={p.number} p={p} kind={kind} />
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="card signal-board">
      <div className="card-title">
        <h2>軸・穴・消し候補</h2>
        <span className="muted">オッズは使わずに選んでいます。最後に決めるのは自分</span>
      </div>
      <div className="board-columns three">
        <Col
          kind="axis"
          title="軸候補"
          list={picks.axis}
          note={
            axisMode === "rank"
              ? "材料の総合が上位で、消しの型がない馬 (保存したレースではこの選び方の方が来ています)"
              : `総合${AXIS_RANGE}位以内で軸の型が多く、消しの型がない馬`
          }
        />
        <Col kind="ana" title="穴候補" list={picks.ana} note="穴の型が消しの型より多い馬" />
        <Col kind="keshi" title="消し候補" list={picks.keshi} note="消しの型が軸・穴の型より多い・総合が下位の馬" />
      </div>
      <p className="muted">
        型の横の%は、保存したレースでその型に当てはまった馬の3着内率です (5頭以上たまると表示)。
        {(() => {
          const proven = [...stats.values()].filter((x) => effect(x.key) === "proven").map((x) => x.label);
          const weak = [...stats.values()].filter((x) => effect(x.key) === "weak").map((x) => x.label);
          if (proven.length + weak.length === 0)
            return ` 型ごとに${MIN_EFFECT_COUNT}頭たまると、${scope}の成績で効く型を優先し、効かない型は候補選びに使わなくなります。`;
          return ` ${scope}の成績で見直し中: ${proven.length ? `★実績あり ${proven.join("・")}` : ""}${proven.length && weak.length ? " ／ " : ""}${weak.length ? `効果薄 (使わない) ${weak.join("・")}` : ""}`;
        })()}
      </p>
    </section>
  );
}

const rateText = (t: Tally) => (t.count > 0 ? pct(t.top3, t.count) : "－");

/** 保存したレースで、軸・穴・消し候補に選んだ馬が実際どうだったか */
export function PickRecordCard({
  record,
  axisMode,
  scope,
  learn,
}: {
  record: PickRecord;
  axisMode: AxisMode;
  scope: string;
  learn?: AxisLearnResult;
}) {
  if (record.races === 0) return null;
  const { axis, ana, keshi, all } = record;
  const rows: { label: string; t: Tally; note: string; used?: boolean; keshi?: boolean; base?: boolean }[] = [
    { label: "軸候補 (型優先)", t: axis.types, note: `総合${AXIS_RANGE}位以内で軸の型が多い2頭`, used: axisMode === "types" },
    { label: "軸候補 (総合順位)", t: axis.rank, note: "材料の総合が上の2頭", used: axisMode === "rank" },
    { label: "穴候補", t: ana, note: "穴の型が多い2頭" },
    { label: "消し候補", t: keshi, note: "3着内に来てしまった割合 (低いほど良い)", keshi: true },
    { label: "出走馬全体", t: all, note: "比べる目安", base: true },
  ];
  const base = all.count > 0 ? all.top3 / all.count : 0;
  return (
    <details className="card details-more pick-record">
      <summary>
        <h2>
          候補の成績 ({scope}・{record.races}レース)
        </h2>
      </summary>
      <p className="muted">
        保存したレースで今の選び方をやり直して、候補に選ばれた馬が3着内に来た割合を数えています。
        {record.races < MIN_AXIS_RACES
          ? ` ${MIN_AXIS_RACES}レースたまると、軸は「型優先」と「総合順位」の成績が良い方で選びます (今は型優先)。`
          : ` 軸は成績の良い「${axisMode === "types" ? "型優先" : "総合順位"}」で選んでいます。`}
      </p>
      <table className="stats-table">
        <thead>
          <tr>
            <th>候補</th>
            <th>頭数</th>
            <th>3着内</th>
            <th>勝率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, t, note, used, keshi: k, base: isBase }) => {
            const rate = t.count > 0 && !isBase ? t.top3 / t.count : undefined;
            const good = rate !== undefined && t.count >= 10 && (k ? rate <= base * 0.6 : rate >= base * 1.3);
            const bad = rate !== undefined && t.count >= 10 && (k ? rate >= base : rate <= base);
            return (
              <tr key={label}>
                <td>
                  {label}
                  {used && <span className="filler-tag">使用中</span>}
                  <span className="recent-sub">{note}</span>
                </td>
                <td>{t.count}</td>
                <td className={good ? "rate-good" : bad ? "rate-bad" : undefined}>{rateText(t)}</td>
                <td>{t.count > 0 ? pct(t.wins, t.count) : "－"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3 className="sub-title">材料ごと (その材料だけで上位2頭を選んだら)</h3>
      <p className="muted">出走馬全体より高い材料が、軸選びに効いている材料です。</p>
      <table className="stats-table">
        <thead>
          <tr>
            <th>材料</th>
            <th>頭数</th>
            <th>3着内</th>
            <th>重み</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(MATERIAL_LABEL) as MaterialKey[]).map((k) => {
            const t = record.materials[k];
            const rate = t.count > 0 ? t.top3 / t.count : undefined;
            const good = rate !== undefined && t.count >= 10 && rate >= base * 1.3;
            const bad = rate !== undefined && t.count >= 10 && rate <= base;
            const w = learn?.improved ? learn.weights[k] : undefined;
            return (
              <tr key={k}>
                <td>{MATERIAL_LABEL[k]}</td>
                <td>{t.count}</td>
                <td className={good ? "rate-good" : bad ? "rate-bad" : undefined}>{rateText(t)}</td>
                <td>{w !== undefined ? w.toFixed(1) : "－"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        {!learn
          ? `${MIN_AXIS_RACES}レースたまると、軸候補が一番来る材料の重みを自動で探します。`
          : learn.improved
            ? `軸候補が一番来る重みに切り替えています (${learn.races}レースで確かめた3着内率: 今までの重み ${pct100(learn.before)} → 初めて見るレースでも ${pct100(learn.holdout)})。`
            : `重みを変えても初めて見るレースで良くなる組み合わせがなかったので、今の重みのままです (${learn.races}レース・3着内率 ${pct100(learn.before)})。`}
      </p>
    </details>
  );
}

/** 型ごとの成績 */
export function SignalStatsCard({
  races,
  stats,
  scope,
  baseRate,
  effect,
}: {
  races: number;
  stats: SignalStat[];
  scope: string; // 例: "川崎" "全競馬場"
  baseRate?: number;
  effect: (key: string) => SignalEffect;
}) {
  const table = (kind: SignalKind) => (
    <table className="stats-table">
      <thead>
        <tr>
          <th>{KIND_NAME[kind]}</th>
          <th>頭数</th>
          <th>3着内</th>
          <th>勝率</th>
          <th>単回収</th>
          <th>扱い</th>
        </tr>
      </thead>
      <tbody>
        {stats
          .filter((s) => s.kind === kind)
          .map((s) => {
            const rate = s.count > 0 ? s.top3 / s.count : undefined;
            const good = rate !== undefined && baseRate !== undefined && s.count >= 5 && rate >= baseRate * 1.3;
            const bad = rate !== undefined && baseRate !== undefined && s.count >= 5 && rate <= baseRate * 0.6;
            return (
              <tr key={s.key}>
                <td>
                  {s.label}
                  <span className="recent-sub">{SIGNAL_TYPES.find((t) => t.key === s.key)?.note}</span>
                </td>
                <td>{s.count}</td>
                <td className={good ? "rate-good" : bad ? "rate-bad" : undefined}>{rate === undefined ? "－" : pct(s.top3, s.count)}</td>
                <td>{s.count > 0 ? pct(s.wins, s.count) : "－"}</td>
                <td>{s.returnRate !== undefined ? `${s.returnRate}%` : "－"}</td>
                <td className={`effect-cell effect-${effect(s.key)}`}>
                  {effect(s.key) === "proven" ? "優先" : effect(s.key) === "weak" ? "使わない" : s.count < MIN_EFFECT_COUNT ? "様子見" : "ふつう"}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
  return (
    <details className="card details-more signal-stats">
      <summary>
        <h2>型の成績 ({scope}・{races}レース)</h2>
      </summary>
      <p className="muted">
        保存したレース (着順あり) で、型に当てはまった馬の成績です。
        {baseRate !== undefined && ` 出走馬全体の3着内率は${Math.round(baseRate * 100)}%。これより高い型 (緑) は軸・穴として、低い型 (赤) は消しとして信頼できそうです。`}
        単勝回収率はオッズが入っていた馬だけで計算しています。
      </p>
      {table("axis")}
      {table("ana")}
      {table("keshi")}
    </details>
  );
}
