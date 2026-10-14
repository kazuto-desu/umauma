import { useMemo, useState } from "react";
import type { TrackBias } from "../lib/bias";
import { parsePaddock, readPaddock } from "../lib/paddock";
import type { Horse, Prediction, PredictOptions, Race } from "../lib/types";
import { verdict, verdictRecord } from "../lib/verdict";
import type { VerdictRecord, VerdictRow } from "../lib/verdict";
import { ComparisonTable } from "./ComparisonTable";
import { FormationView } from "./FormationView";
import { myRecord } from "../lib/myMarks";
import type { MyRecord } from "../lib/myMarks";
import { LapRanking, RisingTop3, storedOffsetFinder } from "./TrainingView";
import { recommend } from "../lib/recommend";
import type { Pick } from "../lib/recommend";

interface Props {
  race: Race;
  horses: Horse[];
  savedRaces: Race[]; // 印の付け方の成績を出すため
  prediction: Prediction;
  options: PredictOptions;
  setOptions: (o: PredictOptions) => void;
  learned?: boolean; // 学習した補正を使っているか
  title: string;
  bias?: TrackBias; // 当日の馬場傾向
  useBias: boolean;
  setUseBias: (v: boolean) => void;
  onHorses: (horses: Horse[]) => void; // オッズを入れたとき
}

export function PredictionView({
  race,
  horses,
  savedRaces,
  prediction,
  options,
  setOptions,
  learned,
  title,
  bias,
  useBias,
  setUseBias,
  onHorses,
}: Props) {
  const offsetOf = useMemo(() => storedOffsetFinder(), []);
  const withWorkouts = horses.filter((h) => h.workouts?.length && !h.scratched);
  const picks = recommend(prediction);
  const marks = verdict(prediction, horses, offsetOf, options.markWeights);
  const record = useMemo(() => verdictRecord(savedRaces, options, offsetOf), [savedRaces, options, offsetOf]);
  const mine = useMemo(() => myRecord(savedRaces), [savedRaces]);
  return (
    <>
      {bias && <BiasCard bias={bias} useBias={useBias} setUseBias={setUseBias} />}
      <FormationView label="1コーナー" title={`${title} 1コーナー`} placements={prediction.firstCorner} />
      <FormationView label="最終コーナー" title={`${title} 最終コーナー`} placements={prediction.finalCorner} />
      <FormationView label="ゴール前" title={`${title} ゴール前`} placements={prediction.goal} />
      <section className="card race-summary">
        <div>
          想定ペース: <strong className={`pace pace-${prediction.pace}`}>{prediction.pace}</strong>
          {"　"}逃げ候補:{" "}
          {prediction.analyses
            .filter((a) => a.style === "逃げ")
            .map((a) => a.number)
            .join(", ") || "なし"}
        </div>
        {prediction.courseNotes.length > 0 && (
          <ul className="notes">
            {prediction.courseNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <p className="muted">
          ゴール前の図は、最終コーナーの位置から末脚 (上がり3F・調教の終いの時計) のある馬ほど前に出るとして描いた目安です。
        </p>
      </section>
      <ComparisonTable race={race} horses={horses} prediction={prediction} offsetOf={offsetOf} onHorses={onHorses} />
      <MyRecordCard record={mine} />
      <PaddockPanel horses={horses} onHorses={onHorses} />
      {withWorkouts.length >= 2 && (
        <details className="card details-more">
          <summary>
            <h2>調教ランキング</h2>
          </summary>
          <section className="sub">
            <LapRanking horses={withWorkouts} offsetOf={offsetOf} title="調教ベスト3 (最終追い切り)" />
            <RisingTop3 horses={withWorkouts} />
          </section>
        </details>
      )}
      <details className="card details-more">
        <summary>
          <h2>隊列の設定</h2>
        </summary>
        <section className="sub summary">
          <label className="field inline">
            <input
              type="checkbox"
              checked={options.useTraining !== false}
              onChange={(e) => setOptions({ ...options, useTraining: e.target.checked })}
            />
            調教の調子を位置取りに反映
          </label>
          {horses.some((h) => h.stableComment) && (
            <label className="field inline">
              <input
                type="checkbox"
                checked={options.useComments !== false}
                onChange={(e) => setOptions({ ...options, useComments: e.target.checked })}
              />
              厩舎コメントの作戦を位置取りに反映
            </label>
          )}
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
            <select value={options.recentRaces} onChange={(e) => setOptions({ ...options, recentRaces: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  近{n}走
                </option>
              ))}
            </select>
          </label>
        </section>
      </details>
      <details className="card details-more app-verdict">
        <summary>
          <h2>アプリの予想 (印) を見る</h2>
        </summary>
        <p className="hint">自分の予想を決めてから見るのがおすすめです。材料に重みを付けて機械的に付けた印なので、参考程度に。</p>
        <VerdictCard rows={marks} record={record} learned={learned} weightsLearned={!!options.markWeights} />
        {(picks.front.length > 0 || picks.closer.length > 0) && (
          <section className="sub picks">
            <h3>展開からのオススメ</h3>
            <PickList title="前残り" picks={picks.front} />
            <PickList title="差し" picks={picks.closer} />
          </section>
        )}
      </details>
    </>
  );
}

/** 自分の印の成績 */
function MyRecordCard({ record }: { record: MyRecord }) {
  if (record.races === 0) return null;
  const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;
  return (
    <section className="card my-record">
      <h2>自分の印の成績</h2>
      <p>
        {record.races}レースで ◎ が <strong>{record.honmeiWin}勝</strong> (勝率{pct(record.honmeiWin, record.races)})・
        <strong>3着以内 {record.honmeiTop3}回</strong> ({pct(record.honmeiTop3, record.races)})
        {record.honmeiReturn !== undefined && (
          <>
            ・単勝回収率 <strong>{record.honmeiReturn}%</strong> ({record.oddsRaces}レース)
          </>
        )}
      </p>
      {record.marked > 0 && (
        <p className="muted">
          印を付けた馬の3着内率 {pct(record.markedTop3, record.marked)} ({record.markedTop3}/{record.marked}頭、☆・消を除く)
        </p>
      )}
      {record.erased > 0 && (
        <p className="muted">
          消した馬が3着以内に来たのは {record.erasedTop3}/{record.erased}頭 ({pct(record.erasedTop3, record.erased)})
        </p>
      )}
    </section>
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

/** 結論: 印を付けた5頭と、この付け方のこれまでの成績 */
function VerdictCard({
  rows,
  record,
  learned,
  weightsLearned,
}: {
  rows: VerdictRow[];
  record: VerdictRecord;
  learned?: boolean;
  weightsLearned?: boolean;
}) {
  if (rows.length === 0) return null;
  const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;
  return (
    <section className="card verdict">
      <h2>結論</h2>
      {learned && <div className="learned-badge">学習した補正を使った予想です</div>}
      {weightsLearned && <div className="learned-badge">学習した印の重みを使っています</div>}
      <ol className="verdict-list">
        {rows.map((r) => (
          <li key={r.number} className={`verdict-${r.mark === "◎" ? "honmei" : "other"}`}>
            <span className="verdict-mark">{r.mark}</span>
            <span className="rank-body">
              <strong>
                {r.number} {r.name}
              </strong>
              <span className="rank-reasons">{r.reasons.join("・")}</span>
            </span>
          </li>
        ))}
      </ol>
      {record.races > 0 ? (
        <p className="verdict-record">
          この印の付け方で、これまでの{record.races}レースでは ◎ が <strong>{record.honmeiWin}勝</strong> (勝率
          {pct(record.honmeiWin, record.races)})・<strong>3着以内 {record.honmeiTop3}回</strong> ({pct(record.honmeiTop3, record.races)})。
          でたらめに選んだ場合の3着以内はおよそ{record.randomTop3}回です。
          {record.odds?.honmeiReturn !== undefined && (
            <>
              {" "}
              オッズを入れた{record.odds.races}レースでの ◎ の単勝回収率は <strong>{record.odds.honmeiReturn}%</strong>。
            </>
          )}
        </p>
      ) : (
        <p className="muted">結果を入れたレースがたまると、この印の付け方の成績がここに出ます。</p>
      )}
    </section>
  );
}

/** 当日の馬場傾向 */
function BiasCard({ bias, useBias, setUseBias }: { bias: TrackBias; useBias: boolean; setUseBias: (v: boolean) => void }) {
  const strength = (v: number) => (Math.abs(v) >= 0.12 ? "はっきり" : Math.abs(v) >= 0.06 ? "やや" : "");
  const front = bias.front >= 0.06 ? "前残り" : bias.front <= -0.06 ? "差しが届く" : "";
  const inner = bias.inner >= 0.06 ? "内有利" : bias.inner <= -0.06 ? "外有利" : "";
  return (
    <section className="card bias">
      <h2>当日の馬場傾向</h2>
      <p>
        {bias.labels.length === 0 ? (
          <strong>今のところ平均的</strong>
        ) : (
          <>
            {front && <strong className="bias-tag">{`${strength(bias.front)}${front}`}</strong>}
            {inner && <strong className="bias-tag">{`${strength(bias.inner)}${inner}`}</strong>}
          </>
        )}
      </p>
      <p className="muted">
        同じ日・同じ競馬場で結果を入れた{bias.races}レースの、3着以内の馬の位置 (最終コーナー) と馬番を、普段と比べています。
        {bias.races < 3 ? " まだレース数が少ないので控えめに反映しています。" : ""}
      </p>
      <label className="field inline">
        <input type="checkbox" checked={useBias} onChange={(e) => setUseBias(e.target.checked)} />
        予想 (ゴール前・結論) に反映
      </label>
    </section>
  );
}

/** パドック評価の貼り付けと読み取り結果 */
function PaddockPanel({ horses, onHorses }: { horses: Horse[]; onHorses: (h: Horse[]) => void }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const listed = horses.filter((h) => h.paddock && !h.scratched);
  const read = () => {
    const list = parsePaddock(text);
    // 馬番と馬名の両方が合う馬だけ (馬名が未登録なら馬番だけで)
    const matched = list.filter((p) => horses.some((h) => h.number === p.number && (!h.name || h.name === p.name)));
    if (matched.length === 0) {
      setMessage(
        list.length === 0
          ? "パドック評価が見つかりませんでした。「⑤馬名 494(-5) 3.3」のような行を含めてコピーしてください。"
          : "このレースの出走馬と馬番・馬名が一致しませんでした。別のレースの評価ではないか確認してください。",
      );
      return;
    }
    onHorses(
      horses.map((h) => {
        const p = matched.find((x) => x.number === h.number);
        if (!p) return h;
        const { number: _n, name: _m, odds, ...paddock } = p;
        return { ...h, paddock, ...(odds ? { odds } : {}) };
      }),
    );
    setText("");
    setMessage(`${matched.length}頭のパドック評価を読み込みました。載っていない馬は評価Cと同じ扱いにします。`);
  };
  return (
    <details className="card odds-panel">
      <summary>
        <h2>パドック評価 {listed.length > 0 ? `(${listed.length}頭)` : "を入れる"}</h2>
      </summary>
      <p className="hint">
        パドック評価を貼り付けると、評価 (A・B…) と短評 (毛ヅヤ・イレ込み・発汗など) を結論に反映します。悪い気配の方を重く見ます。
      </p>
      <textarea rows={3} value={text} placeholder="パドック評価を貼り付け" onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button disabled={!text.trim()} onClick={read}>
          読み込む
        </button>
        {listed.length > 0 && (
          <button className="ghost" onClick={() => onHorses(horses.map(({ paddock: _, ...h }) => h))}>
            パドック評価を消す
          </button>
        )}
      </div>
      {message && <p className="hint">{message}</p>}
      {listed.length > 0 && (
        <ul className="comment-list">
          {listed.map((h) => {
            const r = readPaddock(h.paddock!);
            return (
              <li key={h.number}>
                <strong>
                  {h.number} {h.name}
                  {h.paddock!.weight ? (
                    <span className="verdict-odds-value">
                      {" "}
                      {h.paddock!.weight}kg ({h.paddock!.weightDiff! > 0 ? "+" : ""}
                      {h.paddock!.weightDiff})
                    </span>
                  ) : null}
                </strong>
                <span className={`comment-tags${r.score > 0.5 ? " good" : r.score < 0 ? " bad" : ""}`}>{r.tags.join("・")}</span>
                {h.paddock!.comment && <span className="comment-text">{h.paddock!.comment}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
