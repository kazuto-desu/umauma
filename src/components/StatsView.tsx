import { useMemo } from "react";
import { computeStats } from "../lib/stats";
import type { PredictOptions, Race } from "../lib/types";

/** 保存したレース全体での答え合わせの成績と、補正の偏り */
export function StatsView({ races, options }: { races: Race[]; options: PredictOptions }) {
  const stats = useMemo(() => computeStats(races, options), [races, options]);
  return (
    <section className="card stats">
      <h2>これまでの成績 ({stats.races}レース)</h2>
      {stats.races === 0 ? (
        <p className="hint">結果を読み込んだレースがたまると、ここに予想とのずれの傾向が出ます。</p>
      ) : (
        <>
          <div className="stat-tiles">
            <Tile label="1コーナー" value={stats.first} />
            <Tile label="最終コーナー" value={stats.final} />
            <Tile label="着順" value={stats.goal} />
          </div>
          <p className="muted">平均で何頭分ずれたか (小さいほど当たっている)。保存したレースを今の予想の仕組みで予想し直して比べています。</p>
          <table>
            <thead>
              <tr>
                <th>対象</th>
                <th>延べ頭数</th>
                <th>実際 − 予想</th>
              </tr>
            </thead>
            <tbody>
              {stats.biases.map((b) => (
                <tr key={b.key}>
                  <td>{b.label}</td>
                  <td>{b.count}</td>
                  <td className={b.advice ? "miss" : undefined}>
                    {b.mean === 0 ? "±0" : `${b.mean > 0 ? "+" : ""}${b.mean.toFixed(1)}頭`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">プラスは実際の方が後ろ、マイナスは前だったことを表します。</p>
          {stats.biases.some((b) => b.advice) ? (
            <ul className="notes">
              {stats.biases
                .filter((b) => b.advice)
                .map((b) => (
                  <li key={b.key}>
                    <strong>{b.label}:</strong> {b.advice}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="hint">
              {stats.races < 3
                ? "3レース以上たまると、補正の見直しの目安を出します。"
                : `今のところ大きな偏りはありません${stats.races < 10 ? " (10レースほどたまると傾向がはっきりします)" : ""}。`}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value?: number }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value === undefined ? "－" : `${value.toFixed(1)}頭`}</div>
    </div>
  );
}
