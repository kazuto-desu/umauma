import { useEffect, useMemo, useState } from "react";
import { HorseTable } from "./components/HorseTable";
import { PasteImport } from "./components/PasteImport";
import { PredictionView } from "./components/PredictionView";
import { RaceInfoForm } from "./components/RaceInfoForm";
import { ResultCheck } from "./components/ResultCheck";
import { SavedRaces } from "./components/SavedRaces";
import { StatsView } from "./components/StatsView";
import { Stepper } from "./components/Stepper";
import type { Step } from "./components/Stepper";
import { TrainingView } from "./components/TrainingView";
import { UpdateBanner } from "./components/UpdateBanner";
import { DEFAULT_OPTIONS, predict } from "./lib/predict";
import { SAMPLE_RACE } from "./lib/sample";
import {
  deleteSavedRace,
  loadCurrentRace,
  loadJockeyNotes,
  loadSavedRaces,
  saveCurrentRace,
  saveJockeyNotes,
  saveRace,
} from "./lib/storage";
import type { JockeyTendency, PredictOptions, Race } from "./lib/types";

const STEP_KEY = "umauma.step";

function loadStep(): number {
  try {
    return Number(localStorage.getItem(STEP_KEY) ?? 0) || 0;
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

  useEffect(() => saveCurrentRace(race), [race]);
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

  const prediction = useMemo(() => predict(race, { ...options, jockeyNotes }), [race, options, jockeyNotes]);
  const title = [race.venue, race.surface && race.distance ? `${race.surface}${race.distance}m` : "", race.name]
    .filter(Boolean)
    .join(" ");

  const horses = race.horses;
  const hasPast = horses.some((h) => h.pastRaces.length > 0);
  const steps: Step[] = [
    { key: "race", label: "レース", title: "① レース情報", done: !!race.venue && race.distance > 0 },
    { key: "training", label: "調教", title: "② 調教タイムを貼り付け", done: horses.some((h) => h.workouts?.length) },
    { key: "past", label: "過去走", title: "③ 過去レースを貼り付け", done: hasPast },
    { key: "horses", label: "確認", title: "④ 出走馬の確認・修正", done: horses.length > 0 },
    { key: "predict", label: "予想", title: "⑤ 展開予想", done: hasPast },
    { key: "result", label: "答合せ", title: "⑥ 答え合わせ (レース後)", done: !!race.result?.firstCorner },
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
              go(4);
            }}
          >
            サンプル
          </button>
          <button
            className="ghost"
            onClick={() => {
              setRace({ name: "", venue: "", surface: "ダ", distance: 0, horses: [], date: new Date().toISOString().slice(0, 10) });
              go(0);
            }}
          >
            新規
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
          go(4);
        }}
        onDelete={(id) => {
          setSaved(deleteSavedRace(id));
          if (race.id === id) setRace({ ...race, id: undefined });
        }}
      />

      <Stepper steps={steps} current={step} onSelect={go} />
      <h2 className="step-title">{steps[step].title}</h2>

      {step === 0 && (
        <>
          <p className="hint">まずレースの条件を入れます。あとから戻って変更することもできます。</p>
          <RaceInfoForm race={race} setRace={setRace} />
        </>
      )}

      {step === 1 && (
        <>
          <p className="hint">
            競馬ブックなどの調教欄を貼り付けます。出走馬がまだいなければ、調教欄の馬番・馬名から登録します。調教がなければ「次へ」で飛ばせます。
          </p>
          <TrainingView horses={horses} onChange={setHorses} />
        </>
      )}

      {step === 2 && <PasteImport horses={horses} onImported={setHorses} />}

      {step === 3 && (
        <HorseTable
          horses={horses}
          analyses={prediction.analyses}
          jockeyNotes={jockeyNotes}
          onJockeyNote={setJockeyNote}
          onChange={setHorses}
        />
      )}

      {step === 4 &&
        (hasPast ? (
          <PredictionView horses={horses} prediction={prediction} options={options} setOptions={setOptions} title={title} />
        ) : (
          <section className="card">
            <p className="hint">過去レースの通過順がまだありません。③ で出馬表・馬柱を貼り付けると展開予想が出ます。</p>
            <button onClick={() => go(2)}>③ 過去レースへ</button>
          </section>
        ))}

      {step === 5 &&
        (horses.length > 0 ? (
          <ResultCheck
            horses={horses}
            result={race.result}
            predictedFirst={prediction.firstCorner}
            predictedFinal={prediction.finalCorner}
            predictedGoal={prediction.goal}
            title={title}
            onChange={(result) => {
              // 結果が入ったら保存したレースの一覧に自動で残す (押し忘れ防止)
              const next = { ...race, result };
              if (result?.firstCorner || result?.finish) {
                const r = saveRace(next);
                setSaved(r.list);
                setRace(r.race);
              } else {
                setRace(next);
              }
            }}
          />
        ) : (
          <p className="hint">出走馬を登録すると答え合わせができます。</p>
        ))}
      {step === 5 && <StatsView races={saved} options={{ ...options, jockeyNotes }} />}

      <div className="step-nav">
        <button className="ghost" disabled={step === 0} onClick={() => go(step - 1)}>
          ← 戻る
        </button>
        {step < steps.length - 1 && <button onClick={() => go(step + 1)}>次へ: {steps[step + 1].label} →</button>}
      </div>

      <footer className="muted">アプリの更新: {__BUILD_TIME__}</footer>
    </div>
  );
}
