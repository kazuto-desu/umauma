import { frameColor } from "../lib/frame";
import { SIGNAL_TYPES } from "../lib/signals";
import type { BoardPick, BoardPicks } from "../lib/picks";
import type { Signal, SignalKind, SignalStat } from "../lib/signals";
import type { Horse } from "../lib/types";

const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;

/** 型の成績を短く (例: 複勝率38% 12頭)。数が少ないうちは「データ不足」 */
export function statText(stat: SignalStat | undefined): string {
  if (!stat || stat.count === 0) return "成績データなし";
  if (stat.count < 5) return `${stat.count}頭・データ不足`;
  return `3着内${pct(stat.top3, stat.count)}・${stat.count}頭`;
}

/** 1つの型のバッジ */
export function SignalChip({ signal, stat }: { signal: Signal; stat?: SignalStat }) {
  return (
    <span className={`signal-chip ${signal.kind}`} title={signal.reason}>
      <span className="signal-kind">{signal.kind === "ana" ? "穴" : "消"}</span>
      <span className="signal-label">{signal.label}</span>
      {stat && stat.count >= 5 && <span className="signal-stat">{pct(stat.top3, stat.count)}</span>}
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
}: {
  horses: Horse[];
  picks: BoardPicks;
  stats: Map<string, SignalStat>;
  popularity?: Map<number, number>;
}) {
  if (picks.axis.length + picks.ana.length + picks.keshi.length === 0) return null;
  const frameOf = (n: number) => horses.find((h) => h.number === n)?.frame ?? 0;

  const Row = ({ p, kind }: { p: BoardPick; kind: "axis" | "ana" | "keshi" }) => {
    const c = frameColor(frameOf(p.number));
    const pop = popularity?.get(p.number);
    // その列の型を先に、反対の型 (穴候補の消しの型など) も隠さずに並べる
    const chips = [...p.signals].sort((a, b) => Number(b.kind === (kind === "keshi" ? "keshi" : "ana")) - Number(a.kind === (kind === "keshi" ? "keshi" : "ana")));
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
              <SignalChip key={s.key} signal={s} stat={stats.get(s.key)} />
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
        <Col kind="axis" title="軸候補" list={picks.axis} note="材料の総合が上位で、消しの型がない馬" />
        <Col kind="ana" title="穴候補" list={picks.ana} note="穴の型に当てはまる馬" />
        <Col kind="keshi" title="消し候補" list={picks.keshi} note="消しの型が多い・総合が下位の馬" />
      </div>
      <p className="muted">型の横の%は、保存したレースでその型に当てはまった馬の3着内率です (5頭以上たまると表示)。</p>
    </section>
  );
}

/** 型ごとの成績 */
export function SignalStatsCard({
  races,
  stats,
  scope,
  baseRate,
}: {
  races: number;
  stats: SignalStat[];
  scope: string; // 例: "川崎" "全競馬場"
  baseRate?: number;
}) {
  const table = (kind: SignalKind) => (
    <table className="stats-table">
      <thead>
        <tr>
          <th>{kind === "ana" ? "穴の型" : "消しの型"}</th>
          <th>頭数</th>
          <th>3着内</th>
          <th>勝率</th>
          <th>単回収</th>
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
        {baseRate !== undefined && ` 出走馬全体の3着内率は${Math.round(baseRate * 100)}%。これより高い型 (緑) は穴として、低い型 (赤) は消しとして信頼できそうです。`}
        単勝回収率はオッズが入っていた馬だけで計算しています。
      </p>
      {table("ana")}
      {table("keshi")}
    </details>
  );
}
