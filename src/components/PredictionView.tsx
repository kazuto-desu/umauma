import type { Prediction, PredictOptions } from "../lib/types";
import { FormationView } from "./FormationView";

interface Props {
  prediction: Prediction;
  options: PredictOptions;
  setOptions: (o: PredictOptions) => void;
  title: string;
}

export function PredictionView({ prediction, options, setOptions, title }: Props) {
  return (
    <>
    {prediction.courseNotes.length > 0 && (
      <section className="card">
        <h3>コース・馬場の特徴</h3>
        <ul className="notes">
          {prediction.courseNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    )}
    <section className="card summary">
      <div>
        想定ペース: <strong className={`pace pace-${prediction.pace}`}>{prediction.pace}</strong>
      </div>
      <div>
        逃げ候補:{" "}
        {prediction.analyses
          .filter((a) => a.style === "逃げ")
          .map((a) => a.number)
          .join(", ") || "なし"}
      </div>
      <div>
        展開が向きそう:{" "}
        {prediction.analyses
          .filter((a) => a.advantage === "有利" || a.advantage === "やや有利")
          .map((a) => `${a.number} ${a.name}`)
          .join("、") || "なし"}
      </div>
      {prediction.analyses.some((a) => a.closing) && (
        <div>
          末脚上位:{" "}
          {prediction.analyses
            .filter((a) => a.closing === "S")
            .map((a) => `${a.number} ${a.name}`)
            .join("、")}
        </div>
      )}
      {prediction.analyses.some((a) => a.condition) && (
        <div>
          調教で調子落ち (位置を下げて予想):{" "}
          {prediction.analyses
            .filter((a) => a.condition && a.condition.value >= 0.25)
            .map((a) => `${a.number} ${a.name}`)
            .join("、") || "なし"}
        </div>
      )}
      <label className="field inline">
        <input
          type="checkbox"
          checked={options.useTraining !== false}
          onChange={(e) => setOptions({ ...options, useTraining: e.target.checked })}
        />
        調教の調子を位置取りに反映
      </label>
      <label className="field inline">
        枠順の影響
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={options.gateWeight}
          onChange={(e) => setOptions({ ...options, gateWeight: Number(e.target.value) })}
        />
      </label>
      <label className="field inline">
        参考にする走数
        <select
          value={options.recentRaces}
          onChange={(e) => setOptions({ ...options, recentRaces: Number(e.target.value) })}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              近{n}走
            </option>
          ))}
        </select>
      </label>
    </section>
    <FormationView label="1コーナー" title={`${title} 1コーナー`} placements={prediction.firstCorner} />
    <FormationView label="最終コーナー" title={`${title} 最終コーナー`} placements={prediction.finalCorner} />
    </>
  );
}
