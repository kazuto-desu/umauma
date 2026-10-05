import { useState } from "react";
import { compare, extractCorners, parseCornerNotation } from "../lib/result";
import type { Horse, Placement, RaceResult } from "../lib/types";
import { FormationView } from "./FormationView";

interface Props {
  horses: Horse[];
  result?: RaceResult;
  predictedFirst: Placement[];
  predictedFinal: Placement[];
  title: string;
  onChange: (result: RaceResult | undefined) => void;
}

export function ResultCheck({ horses, result, predictedFirst, predictedFinal, title, onChange }: Props) {
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState("");
  const r = result ?? { firstCorner: "", finalCorner: "" };
  const actualFirst = parseCornerNotation(r.firstCorner, horses);
  const actualFinal = parseCornerNotation(r.finalCorner, horses);

  const readPaste = () => {
    const found = extractCorners(paste);
    if (!found.firstCorner) {
      setMessage("「1コーナー」「4コーナー」などの通過順が見つかりませんでした。下の欄に直接入力もできます。");
      return;
    }
    onChange({ firstCorner: found.firstCorner, finalCorner: found.finalCorner ?? found.firstCorner });
    setPaste("");
    setMessage("通過順を読み込みました。");
  };

  return (
    <details className="card" open={!!result?.firstCorner}>
      <summary>
        <h2>答え合わせ</h2>
      </summary>
      <p className="hint">
        レース後、結果ページの「コーナー通過順位」を貼り付けると、予想とのずれを表示します。
      </p>
      <textarea rows={3} value={paste} placeholder="結果ページを貼り付け" onChange={(e) => setPaste(e.target.value)} />
      <button disabled={!paste.trim()} onClick={readPaste}>
        読み込む
      </button>
      {message && <p className="hint">{message}</p>}
      <label className="field">
        実際の1コーナー (最初のコーナー)
        <input
          value={r.firstCorner}
          placeholder="(3,8)1-6,12(4,10)"
          onChange={(e) => onChange({ ...r, firstCorner: e.target.value })}
        />
      </label>
      <label className="field">
        実際の最終コーナー
        <input
          value={r.finalCorner}
          placeholder="3,1(8,6)-12"
          onChange={(e) => onChange({ ...r, finalCorner: e.target.value })}
        />
      </label>
      {actualFirst.length > 0 && <Comparison label="1コーナー" predicted={predictedFirst} actual={actualFirst} />}
      {actualFinal.length > 0 && <Comparison label="最終コーナー" predicted={predictedFinal} actual={actualFinal} />}
      {actualFirst.length > 0 && <FormationView label="実際の1コーナー" title={`${title} 実際の1コーナー`} placements={actualFirst} />}
      {actualFinal.length > 0 && (
        <FormationView label="実際の最終コーナー" title={`${title} 実際の最終コーナー`} placements={actualFinal} />
      )}
      {result && (
        <button className="ghost" onClick={() => onChange(undefined)}>
          結果を消す
        </button>
      )}
    </details>
  );
}

function Comparison({ label, predicted, actual }: { label: string; predicted: Placement[]; actual: Placement[] }) {
  const { rows, meanAbs } = compare(predicted, actual);
  return (
    <div className="comparison">
      <h3>
        {label}: 平均 {meanAbs.toFixed(1)} 頭分のずれ
      </h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>実際</th>
              <th>予想</th>
              <th>馬番</th>
              <th>馬名</th>
              <th>ずれ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.number}>
                <td>{row.actual}</td>
                <td>{row.predicted}</td>
                <td>{row.number}</td>
                <td>{row.name}</td>
                <td className={Math.abs(row.diff) >= 4 ? "miss" : undefined}>
                  {row.diff === 0 ? "的中" : row.diff > 0 ? `${row.diff}頭 後ろ` : `${-row.diff}頭 前`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
