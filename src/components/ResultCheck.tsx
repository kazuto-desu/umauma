import { useState } from "react";
import { compare, extractCorners, parseCornerNotation, parseResultTable, resultFromTable } from "../lib/result";
import type { Horse, Placement, RaceResult } from "../lib/types";
import { FormationView } from "./FormationView";

interface Props {
  horses: Horse[];
  result?: RaceResult;
  predictedFirst: Placement[];
  predictedFinal: Placement[];
  predictedGoal: Placement[];
  title: string;
  onChange: (result: RaceResult | undefined) => void;
}

export function ResultCheck({ horses, result, predictedFirst, predictedFinal, predictedGoal, title, onChange }: Props) {
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState("");
  const r = result ?? { firstCorner: "", finalCorner: "" };
  const actualFirst = parseCornerNotation(r.firstCorner, horses);
  const actualFinal = parseCornerNotation(r.finalCorner, horses);
  const actualFinish = parseCornerNotation(r.finish ?? "", horses);

  const readPaste = () => {
    // JRA の「1コーナー (3,8)1-6...」形式
    const found = extractCorners(paste);
    if (found.firstCorner) {
      onChange({ ...r, firstCorner: found.firstCorner, finalCorner: found.finalCorner ?? found.firstCorner });
      setPaste("");
      setMessage("コーナー通過順位を読み込みました。");
      return;
    }
    // 地方などの1頭1行の結果表 (着順・馬番・通過順 "1-1-1")
    const rows = parseResultTable(paste);
    const table = resultFromTable(rows);
    if (!table) {
      setMessage("通過順が見つかりませんでした。結果表の着順から通過順までの部分を含めてコピーしてください。下の欄に直接入力もできます。");
      return;
    }
    // 出走馬と馬番・馬名が合っているか確かめる
    const matched = rows.filter((row) => horses.some((h) => h.number === row.number && (!h.name || h.name === row.name)));
    if (matched.length < rows.length / 2) {
      setMessage(
        `結果表の馬 (${rows.map((x) => x.name).slice(0, 3).join("・")}…) が、このレースの出走馬と一致しません。別のレースの結果ではないか確認してください。`,
      );
      return;
    }
    onChange(table);
    setPaste("");
    setMessage(
      `結果表を読み込みました (${rows.length}頭、着順と通過順)。` +
        (matched.length < rows.length ? ` 馬名が一致しない馬が${rows.length - matched.length}頭います。` : ""),
    );
  };

  return (
    <section className="card">
      <p className="hint">
        レース後、結果ページを貼り付けると、予想とのずれを表示します。JRA の「コーナー通過順位」と、地方の結果表 (1頭1行で「1-1-1」のような通過順があるもの) に対応しています。
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
      <label className="field">
        着順 (馬番を上位から)
        <input value={r.finish ?? ""} placeholder="1,2,7,11" onChange={(e) => onChange({ ...r, finish: e.target.value })} />
      </label>
      {actualFirst.length > 0 && <Comparison label="1コーナー" predicted={predictedFirst} actual={actualFirst} />}
      {actualFinal.length > 0 && <Comparison label="最終コーナー" predicted={predictedFinal} actual={actualFinal} />}
      {actualFinish.length > 0 && <Comparison label="ゴール前 (着順)" predicted={predictedGoal} actual={actualFinish} />}
      {actualFirst.length > 0 && <FormationView label="実際の1コーナー" title={`${title} 実際の1コーナー`} placements={actualFirst} />}
      {actualFinal.length > 0 && (
        <FormationView label="実際の最終コーナー" title={`${title} 実際の最終コーナー`} placements={actualFinal} />
      )}
      {result && (
        <button className="ghost" onClick={() => onChange(undefined)}>
          結果を消す
        </button>
      )}
    </section>
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
