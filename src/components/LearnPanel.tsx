import { useState } from "react";
import { MIN_RACES, describeParams, learn } from "../lib/learn";
import type { SavedTuning } from "../lib/storage";
import type { PredictOptions, Race } from "../lib/types";

interface Props {
  races: Race[];
  options: PredictOptions; // 学習前の設定 (学習した補正を含まない)
  tuning: SavedTuning | null;
  onChange: (t: SavedTuning | null) => void;
}

/** 保存したレースの結果から補正を学習し、予想に使うかを選ぶ */
export function LearnPanel({ races, options, tuning, onChange }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const withResult = races.filter((r) => r.result?.firstCorner || r.result?.finish).length;
  const r = tuning?.result;

  const run = async () => {
    setProgress(0);
    const result = await learn(races, options, setProgress);
    setProgress(null);
    // 初見のレースでも良くなったときだけ、最初から使う設定にする
    if (result) onChange({ result, enabled: result.improved });
  };

  return (
    <section className="card learn">
      <h2>学習</h2>
      <p className="hint">
        結果を入れたレースから、枠順の影響・脚質ごとの位置・調教の調子・末脚の効き方を調整します。
        ({withResult}レース / {MIN_RACES}レース以上で学習できます)
      </p>
      <button disabled={withResult < MIN_RACES || progress !== null} onClick={run}>
        {progress !== null ? `学習中… ${Math.round(progress * 100)}%` : r ? "学習し直す" : "保存したレースから学習する"}
      </button>
      {progress !== null && <progress value={progress} max={1} />}

      {r && progress === null && (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <div className="stat-label">学習前</div>
              <div className="stat-value">{r.baseline.toFixed(2)}頭</div>
            </div>
            <div className="stat-tile">
              <div className="stat-label">学習後</div>
              <div className="stat-value">{r.fitted.toFixed(2)}頭</div>
            </div>
            <div className="stat-tile">
              <div className="stat-label">初見のレース</div>
              <div className={`stat-value ${r.improved ? "good" : ""}`}>{r.holdout.toFixed(2)}頭</div>
            </div>
          </div>
          <p className="muted">
            平均のずれ (1コーナー・最終コーナー・着順)。「初見のレース」は、1レースずつ抜いて残りで学習し、抜いたレースで確かめた値です。学習に使っていないレースでも当たるかの目安になります。
          </p>
          <p className={r.improved ? "learn-verdict good" : "learn-verdict"}>
            {r.improved
              ? `初見のレースでも平均 ${(r.baseline - r.holdout).toFixed(2)}頭分 ずれが小さくなりました。`
              : "初見のレースでははっきりした改善が見られませんでした。レースが増えてから学習し直すのがおすすめです。"}
          </p>
          <ul className="notes">
            {describeParams(r.params).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <label className="field inline">
            <input
              type="checkbox"
              checked={tuning!.enabled}
              onChange={(e) => onChange({ ...tuning!, enabled: e.target.checked })}
            />
            学習した補正を予想に使う
          </label>
          <p className="muted">
            {r.races}レースで学習 ({new Date(r.learnedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })})
            {withResult > r.races && ` ・その後 ${withResult - r.races}レース増えています。学習し直すと反映されます`}
          </p>
        </>
      )}
    </section>
  );
}
