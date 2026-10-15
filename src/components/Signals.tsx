import { frameColor } from "../lib/frame";
import { SIGNAL_TYPES } from "../lib/signals";
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
 * 穴候補・消し候補のボード。型に当てはまった馬を、理由と型の成績つきで並べる。
 * 印は付けない (決めるのは自分)。
 */
export function SignalBoard({
  horses,
  signals,
  stats,
  popularity,
}: {
  horses: Horse[];
  signals: Map<number, Signal[]>;
  stats: Map<string, SignalStat>;
  popularity?: Map<number, number>; // 「人気を見る」を押したときだけ
}) {
  const column = (kind: SignalKind) =>
    horses
      .filter((h) => !h.scratched)
      .map((h) => ({ h, list: (signals.get(h.number) ?? []).filter((s) => s.kind === kind) }))
      .filter((x) => x.list.length > 0)
      .sort((a, b) => b.list.length - a.list.length || a.h.number - b.h.number);
  const ana = column("ana");
  const keshi = column("keshi");
  if (ana.length === 0 && keshi.length === 0) return null;

  const Row = ({ h, list }: { h: Horse; list: Signal[] }) => {
    const c = frameColor(h.frame);
    const pop = popularity?.get(h.number);
    return (
      <li>
        <div className="board-horse">
          <span className="frame-badge small" style={{ background: c.bg, color: c.fg }}>
            {h.number}
          </span>
          <strong>{h.name}</strong>
          {pop !== undefined && <span className={`pop-badge${pop >= 6 ? " long" : ""}`}>{pop}番人気</span>}
        </div>
        <ul className="board-reasons">
          {list.map((s) => (
            <li key={s.key}>
              <SignalChip signal={s} stat={stats.get(s.key)} />
              <span className="board-reason">{s.reason}</span>
            </li>
          ))}
        </ul>
      </li>
    );
  };

  return (
    <section className="card signal-board">
      <div className="card-title">
        <h2>穴・消し候補</h2>
        <span className="muted">型に当てはまった馬。買う・消すは自分で</span>
      </div>
      <div className="board-columns">
        <div className="board-col ana">
          <h3>穴候補</h3>
          {ana.length === 0 ? (
            <p className="muted">該当なし</p>
          ) : (
            <ul className="board-list">
              {ana.map((x) => (
                <Row key={x.h.number} {...x} />
              ))}
            </ul>
          )}
        </div>
        <div className="board-col keshi">
          <h3>消し候補</h3>
          {keshi.length === 0 ? (
            <p className="muted">該当なし</p>
          ) : (
            <ul className="board-list">
              {keshi.map((x) => (
                <Row key={x.h.number} {...x} />
              ))}
            </ul>
          )}
        </div>
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
