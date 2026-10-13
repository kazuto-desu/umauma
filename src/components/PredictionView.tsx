import { useMemo } from "react";
import type { Horse, Prediction, PredictOptions } from "../lib/types";
import { FormationView } from "./FormationView";
import { LapRanking, RisingTop3, storedOffsetFinder } from "./TrainingView";
import { recommend } from "../lib/recommend";
import type { Pick } from "../lib/recommend";

interface Props {
  horses: Horse[];
  prediction: Prediction;
  options: PredictOptions;
  setOptions: (o: PredictOptions) => void;
  learned?: boolean; // 学習した補正を使っているか
  title: string;
}

export function PredictionView({ horses, prediction, options, setOptions, learned, title }: Props) {
  const offsetOf = useMemo(() => storedOffsetFinder(), []);
  const withWorkouts = horses.filter((h) => h.workouts?.length && !h.scratched);
  const picks = recommend(prediction);
  return (
    <>
    {(picks.front.length > 0 || picks.closer.length > 0) && (
      <section className="card picks">
        <h3>オススメ</h3>
        <PickList title="前残り" picks={picks.front} />
        <PickList title="差し" picks={picks.closer} />
        <p className="muted">
          最終コーナーを前で回る馬・後ろから来る馬に分けて、ゴール前の想定位置が良い順に選んでいます。展開からの目安です。
        </p>
      </section>
    )}
    {withWorkouts.length >= 2 && (
      <section className="card">
        <LapRanking horses={withWorkouts} offsetOf={offsetOf} title="調教ベスト3 (最終追い切り)" />
        <RisingTop3 horses={withWorkouts} />
      </section>
    )}
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
      {learned && <div className="learned-badge">学習した補正を使った予想です</div>}
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
        ゴール前の想定上位:{" "}
        {[...prediction.analyses]
          .filter((a) => a.goal !== undefined)
          .sort((a, b) => a.goal! - b.goal!)
          .slice(0, 3)
          .map((a, i) => `${i + 1}. ${a.number} ${a.name}`)
          .join("　")}
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
          disabled={learned}
          value={options.gateWeight}
          onChange={(e) => setOptions({ ...options, gateWeight: Number(e.target.value) })}
        />
        {learned && <span className="muted">学習値 {options.gateWeight} を使用中</span>}
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
    <FormationView label="ゴール前" title={`${title} ゴール前`} placements={prediction.goal} />
    <p className="hint">
      ゴール前は、最終コーナーの位置から末脚 (過去レースの上がり3F・調教の終いの時計) のある馬ほど前に出るとして描いた目安です。直線の長いコースほど差が開きます。
    </p>
    </>
  );
}

function PickList({ title, picks }: { title: string; picks: Pick[] }) {
  return (
    <div className="pick-group">
      <div className="pick-title">{title}</div>
      {picks.length === 0 ? (
        <p className="muted">該当する馬がいません</p>
      ) : (
        <ol>
          {picks.map((p) => (
            <li key={p.number}>
              <strong>
                {p.number} {p.name}
              </strong>
              <span className="rank-reasons">{p.reasons.join("・")}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
