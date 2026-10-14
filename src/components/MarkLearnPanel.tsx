import { useState } from "react";
import { MIN_MARK_RACES, learnMarkWeights } from "../lib/markLearn";
import type { SavedMarkWeights } from "../lib/storage";
import type { MarkWeights, PredictOptions, Race } from "../lib/types";
import { DEFAULT_WEIGHTS, WEIGHT_KEYS } from "../lib/verdict";
import { storedOffsetFinder } from "./TrainingView";

const LABELS: Record<keyof MarkWeights, string> = {
  goal: "展開 (ゴール前の想定)",
  form: "近走の成績",
  lap: "調教ラップ",
  rise: "調子の上昇",
  talk: "厩舎コメント",
};
// 重みは合計に対する割合で見せる
const share = (w: MarkWeights, k: keyof MarkWeights) => `${Math.round((w[k] / WEIGHT_KEYS.reduce((s, x) => s + w[x], 0)) * 100)}%`;

/** 結論の印の重みを、保存したレースの着順から学習する */
export function MarkLearnPanel({
  races,
  options,
  saved,
  onChange,
}: {
  races: Race[];
  options: PredictOptions;
  saved: SavedMarkWeights | null;
  onChange: (s: SavedMarkWeights | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const withFinish = races.filter((r) => (r.result?.finish ?? "").split(",").filter(Boolean).length >= 3).length;
  const r = saved?.result;

  const run = () => {
    setBusy(true);
    setMessage("");
    // 計算中の表示を先に出してから計算する
    setTimeout(() => {
      const result = learnMarkWeights(races, options, storedOffsetFinder());
      setBusy(false);
      if (!result) {
        setMessage(`着順を入れたレースが${MIN_MARK_RACES}レース以上必要です。`);
        return;
      }
      // 初見のレースでも良くなったときだけ、最初から使う設定にする
      onChange({ result, enabled: result.improved });
    }, 30);
  };

  return (
    <section className="card learn">
      <h2>印の重みの学習</h2>
      <p className="hint">
        結論の印 (◎○▲) を付けるときの材料の重みを、保存したレースの着順から見直します。今は着順を入れたレースが{withFinish}
        レースあります{withFinish < MIN_MARK_RACES ? ` (${MIN_MARK_RACES}レース以上で学習できます)` : ""}。
      </p>
      <button disabled={busy || withFinish < MIN_MARK_RACES} onClick={run}>
        {busy ? "計算中…" : "印の重みを学習する"}
      </button>
      {message && <p className="hint">{message}</p>}
      {r && (
        <>
          <table>
            <thead>
              <tr>
                <th>材料</th>
                <th>今まで</th>
                <th>学習した重み</th>
              </tr>
            </thead>
            <tbody>
              {WEIGHT_KEYS.map((k) => (
                <tr key={k}>
                  <td>{LABELS[k]}</td>
                  <td>{share(DEFAULT_WEIGHTS, k)}</td>
                  <td className={r.weights[k] !== DEFAULT_WEIGHTS[k] ? "learn-changed" : undefined}>{share(r.weights, k)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            ◎○▲の平均着順 ({r.races}レース): 今までの重み {r.before}着 → 学習した重み {r.after}着。
            初見のレースで確かめると {r.holdout}着。
          </p>
          <p className="learn-verdict">
            {r.improved
              ? "初見のレースでも良くなったので、学習した重みで結論を出せます。"
              : "初見のレースでは今までの重みとほとんど変わりません。もう少しレースがたまってから学習し直してください。"}
          </p>
          <label className="field inline">
            <input type="checkbox" checked={saved!.enabled} onChange={(e) => onChange({ ...saved!, enabled: e.target.checked })} />
            学習した重みで結論を出す
          </label>
        </>
      )}
    </section>
  );
}
