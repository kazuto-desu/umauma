import { useEffect, useMemo, useState } from "react";
import { CommentPaste } from "./components/CommentPaste";
import { HorseTable } from "./components/HorseTable";
import { PasteImport } from "./components/PasteImport";
import { QuickPaste } from "./components/QuickPaste";
import { PredictionView } from "./components/PredictionView";
import { RaceInfoForm } from "./components/RaceInfoForm";
import { ResultCheck } from "./components/ResultCheck";
import { SavedRaces } from "./components/SavedRaces";
import { LearnPanel } from "./components/LearnPanel";
import { MarkLearnPanel } from "./components/MarkLearnPanel";
import { StatsView } from "./components/StatsView";
import { Stepper } from "./components/Stepper";
import type { Step } from "./components/Stepper";
import { TrainingView } from "./components/TrainingView";
import { UpdateBanner, reloadLatest } from "./components/UpdateBanner";
import { BulkImport } from "./components/BulkImport";
import { trackBias } from "./lib/bias";
import { nextRace } from "./lib/raceLine";
import { DEFAULT_OPTIONS, predict } from "./lib/predict";
import { SAMPLE_RACE } from "./lib/sample";
import {
  deleteSavedRace,
  loadCurrentRace,
  loadJockeyNotes,
  loadSavedRaces,
  loadMarkWeights,
  loadTuning,
  saveCurrentRace,
  saveJockeyNotes,
  saveRace,
  saveMarkWeights,
  saveTuning,
} from "./lib/storage";
import type { SavedMarkWeights, SavedTuning } from "./lib/storage";
import type { JockeyTendency, PredictOptions, Race } from "./lib/types";

const STEP_KEY = "umauma.step2";
const OLD_STEP_KEY = "umauma.step"; // 6段階だったころの保存値

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// 新しいレース。同じ日なら競馬場・馬場状態を引き継ぎ、次のRにする
const blankRace = (prev?: Race): Race => nextRace(prev && !prev.isSample ? prev : undefined, today());

function loadStep(): number {
  try {
    const now = localStorage.getItem(STEP_KEY);
    if (now !== null) return Number(now) || 0;
    // 調教・過去走が「貼り付け」1つにまとまったので、前の段階番号を読み替える
    const old = Number(localStorage.getItem(OLD_STEP_KEY) ?? 0) || 0;
    return [0, 1, 1, 2, 3, 4][old] ?? 0;
  } catch {
    return 0;
  }
}

export default function App() {
  const [race, setRace] = useState<Race>(() => loadCurrentRace(SAMPLE_RACE));
  const [options, setOptions] = useState<PredictOptions>(DEFAULT_OPTIONS);
  const [saved, setSaved] = useState<Race[]>(loadSavedRaces);
  const [jockeyNotes, setJockeyNotes] = useState<Record<string, JockeyTendency>>(loadJockeyNotes);
  const [step, setStep] = useState(loadStep);
  const [tuning, setTuning] = useState<SavedTuning | null>(loadTuning);
  useEffect(() => saveTuning(tuning), [tuning]);
  const [markWeights, setMarkWeights] = useState<SavedMarkWeights | null>(loadMarkWeights);
  useEffect(() => saveMarkWeights(markWeights), [markWeights]);
  // 学習した補正を使うときは、枠順の影響と補正の強さを学習値にする
  const effective: PredictOptions = useMemo(
    () => ({
      ...options,
      jockeyNotes,
      ...(tuning?.enabled ? { gateWeight: tuning.result.params.gateWeight, tuning: tuning.result.params.tuning } : {}),
      ...(markWeights?.enabled ? { markWeights: markWeights.result.weights } : {}),
    }),
    [options, jockeyNotes, tuning, markWeights],
  );

  useEffect(() => saveCurrentRace(race), [race]);
  const [savedNote, setSavedNote] = useState("");

  // 出走馬が入ったレースは、結果の前でも保存したレースの一覧に自動で残す (途中保存)
  const isSample = race.isSample || race.name === SAMPLE_RACE.name;
  useEffect(() => {
    if (isSample || race.horses.length === 0) return;
    const r = saveRace(race);
    setSaved(r.list);
    if (r.race !== race) setRace(r.race); // 初めての保存で id が付いたとき
  }, [race, isSample]);

  const saveNow = () => {
    if (isSample) {
      setSavedNote("サンプルは保存しません");
    } else if (race.horses.length === 0) {
      setSavedNote("出走馬を登録すると保存できます");
    } else {
      const r = saveRace(race);
      setSaved(r.list);
      setRace(r.race);
      setSavedNote("保存しました");
    }
    setTimeout(() => setSavedNote(""), 2500);
  };
  useEffect(() => saveJockeyNotes(jockeyNotes), [jockeyNotes]);
  useEffect(() => {
    try {
      localStorage.setItem(STEP_KEY, String(step));
    } catch {
      /* 保存できなくても動作は続ける */
    }
  }, [step]);

  const setJockeyNote = (name: string, t: JockeyTendency) => {
    const next = { ...jockeyNotes };
    if (t === "普通") delete next[name];
    else next[name] = t;
    setJockeyNotes(next);
  };

  // 当日の馬場傾向 (同じ日・同じ競馬場の結果から)。この画面のこのレースの予想だけに反映する
  const bias = useMemo(() => trackBias(saved, race), [saved, race]);
  const [useBias, setUseBias] = useState(true);
  const prediction = useMemo(
    () => predict(race, bias && useBias ? { ...effective, bias: { front: bias.front, inner: bias.inner } } : effective),
    [race, effective, bias, useBias],
  );
  const title = [race.venue, race.surface && race.distance ? `${race.surface}${race.distance}m` : "", race.name]
    .filter(Boolean)
    .join(" ");

  const horses = race.horses;
  // 予想ページは、過去走か調教のどちらかが入っていれば使える (調教だけでも予想できる)
  const hasPast = horses.some((h) => h.pastRaces.length > 0 || (h.workouts?.length ?? 0) > 0);
  const steps: Step[] = [
    { key: "race", label: "レース", title: "① レース情報", done: !!race.venue && race.distance > 0 },
    { key: "paste", label: "貼り付け", title: "② 貼り付け (馬柱・調教・コメントなど)", done: hasPast },
    { key: "horses", label: "確認", title: "③ 出走馬の確認・修正", done: horses.length > 0 },
    { key: "predict", label: "予想", title: "④ 予想", done: hasPast },
    { key: "result", label: "答合せ", title: "⑤ 答え合わせ (レース後)", done: !!race.result?.firstCorner },
  ];
  const go = (i: number) => {
    setStep(Math.max(0, Math.min(steps.length - 1, i)));
    window.scrollTo({ top: 0 });
  };
  const setHorses = (h: Race["horses"]) => setRace({ ...race, horses: h });

  return (
    <div className="app">
      <UpdateBanner />
      <header>
        <h1>うまうま展開予想</h1>
        <div className="header-actions">
          <button
            className="ghost"
            onClick={() => {
              setRace(SAMPLE_RACE);
              go(3);
            }}
          >
            サンプル
          </button>
          <button
            className="ghost"
            onClick={() => {
              setRace(blankRace(race));
              go(0);
            }}
          >
            次のレース
          </button>
        </div>
      </header>

      <SavedRaces
        races={saved}
        currentId={race.id}
        onSave={() => {
          const r = saveRace(race);
          setSaved(r.list);
          setRace(r.race);
        }}
        onOpen={(r) => {
          setRace(r);
          go(r.result?.firstCorner || r.result?.finish ? 4 : 3);
        }}
        onDelete={(id) => {
          setSaved(deleteSavedRace(id));
          // 開いているレースを消したら、自動保存で戻ってこないよう新しいレースに切り替える
          if (race.id === id) {
            setRace(blankRace());
            go(0);
          }
        }}
      />

      <Stepper steps={steps} current={step} onSelect={go} />
      <h2 className="step-title">{steps[step].title}</h2>

      {step === 0 && (
        <>
          <p className="hint">まずレースの条件を入れます。あとから戻って変更することもできます。</p>
          <RaceInfoForm race={race} setRace={setRace} />
          <BulkImport saved={saved} onSaved={setSaved} />
        </>
      )}

      {step === 1 && (
        <>
          <QuickPaste race={race} setRace={setRace} />
          <details className="card details-more">
            <summary>
              <h2>種類を選んで貼る (うまく読めないとき)</h2>
            </summary>
            <p className="hint">自動で見分けられなかったときは、種類ごとの欄から貼ってください。調教のラップ表もここで見られます。</p>
            <h3>馬柱 (過去レース)</h3>
            <PasteImport horses={horses} onImported={setHorses} />
            <h3>調教</h3>
            <TrainingView horses={horses} onChange={setHorses} />
            <CommentPaste horses={horses} onChange={setHorses} />
          </details>
        </>
      )}

      {step === 2 && (
        <HorseTable
          horses={horses}
          analyses={prediction.analyses}
          jockeyNotes={jockeyNotes}
          onJockeyNote={setJockeyNote}
          onChange={setHorses}
        />
      )}

      {step === 3 && hasPast && <QuickPaste race={race} setRace={setRace} compact />}
      {step === 3 &&
        (hasPast ? (
          <PredictionView
            race={race}
            horses={horses}
            savedRaces={saved}
            prediction={prediction}
            options={effective}
            // 画面の操作で変えられるのは手動の設定だけ (学習値や騎手メモは混ぜない)
            setOptions={(o) =>
              setOptions({ gateWeight: o.gateWeight, recentRaces: o.recentRaces, useTraining: o.useTraining, useComments: o.useComments })
            }
            learned={!!tuning?.enabled}
            title={title}
            bias={bias}
            useBias={useBias}
            setUseBias={setUseBias}
            onHorses={setHorses}
          />
        ) : (
          <section className="card">
            <p className="hint">馬柱も調教もまだありません。② で馬柱か調教を貼り付けると予想ページが使えます (調教だけでも予想できます)。</p>
            <button onClick={() => go(1)}>② 貼り付けへ</button>
          </section>
        ))}

      {step === 4 &&
        (horses.length > 0 ? (
          <ResultCheck
            horses={horses}
            result={race.result}
            predictedFirst={prediction.firstCorner}
            predictedFinal={prediction.finalCorner}
            predictedGoal={prediction.goal}
            title={title}
            onChange={(result) => setRace({ ...race, result })}
          />
        ) : (
          <p className="hint">出走馬を登録すると答え合わせができます。</p>
        ))}
      {step === 4 && <StatsView races={saved} options={effective} />}
      {step === 4 && <LearnPanel races={saved} options={{ ...options, jockeyNotes }} tuning={tuning} onChange={setTuning} />}
      {step === 4 && <MarkLearnPanel races={saved} options={effective} saved={markWeights} onChange={setMarkWeights} />}

      <div className="step-nav">
        <button className="ghost" disabled={step === 0} onClick={() => go(step - 1)}>
          ← 戻る
        </button>
        <button className="ghost save-now" onClick={saveNow}>
          {savedNote || "途中保存"}
        </button>
        {step < steps.length - 1 ? (
          <button onClick={() => go(step + 1)}>次へ: {steps[step + 1].label} →</button>
        ) : (
          <button
            onClick={() => {
              setRace(blankRace(race));
              go(0);
            }}
          >
            次のレースへ →
          </button>
        )}
      </div>

      <footer className="muted app-footer">
        <span>アプリの更新: {__BUILD_TIME__}</span>
        <button className="ghost footer-reload" onClick={reloadLatest}>
          最新版を読み込む
        </button>
      </footer>
    </div>
  );
}
