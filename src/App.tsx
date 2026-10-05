import { useEffect, useMemo, useState } from "react";
import { FormationView } from "./components/FormationView";
import { HorseTable } from "./components/HorseTable";
import { PasteImport } from "./components/PasteImport";
import { ResultCheck } from "./components/ResultCheck";
import { SavedRaces } from "./components/SavedRaces";
import { VENUES, distancesFor, findCourse } from "./lib/courses";
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
import type { Going, JockeyTendency, PredictOptions, Race } from "./lib/types";

const GOINGS: Going[] = ["良", "稍重", "重", "不良"];

export default function App() {
  const [race, setRace] = useState<Race>(() => loadCurrentRace(SAMPLE_RACE));
  const [options, setOptions] = useState<PredictOptions>(DEFAULT_OPTIONS);
  const [saved, setSaved] = useState<Race[]>(loadSavedRaces);
  const [jockeyNotes, setJockeyNotes] = useState<Record<string, JockeyTendency>>(loadJockeyNotes);

  useEffect(() => saveCurrentRace(race), [race]);
  useEffect(() => saveJockeyNotes(jockeyNotes), [jockeyNotes]);

  const setJockeyNote = (name: string, t: JockeyTendency) => {
    const next = { ...jockeyNotes };
    if (t === "普通") delete next[name];
    else next[name] = t;
    setJockeyNotes(next);
  };

  const course = findCourse(race.venue, race.surface, race.distance);
  const prediction = useMemo(() => predict(race, { ...options, jockeyNotes }), [race, options, jockeyNotes]);
  const title = [race.venue, race.surface && race.distance ? `${race.surface}${race.distance}m` : "", race.name]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="app">
      <header>
        <h1>うまうま展開予想</h1>
        <div className="header-actions">
          <button className="ghost" onClick={() => setRace(SAMPLE_RACE)}>
            サンプル
          </button>
          <button
            className="ghost"
            onClick={() =>
              setRace({ name: "", venue: "", surface: "芝", distance: 0, horses: [], date: new Date().toISOString().slice(0, 10) })
            }
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
        onOpen={setRace}
        onDelete={(id) => {
          setSaved(deleteSavedRace(id));
          if (race.id === id) setRace({ ...race, id: undefined });
        }}
      />

      <section className="card race-info">
        <label className="field">
          レース名
          <input value={race.name} onChange={(e) => setRace({ ...race, name: e.target.value })} />
        </label>
        <label className="field">
          日付
          <input type="date" value={race.date ?? ""} onChange={(e) => setRace({ ...race, date: e.target.value })} />
        </label>
        <label className="field">
          競馬場
          <select value={race.venue} onChange={(e) => setRace({ ...race, venue: e.target.value })}>
            <option value="">選択</option>
            {VENUES.map((v) => (
              <option key={v}>{v}</option>
            ))}
            {race.venue && !(VENUES as readonly string[]).includes(race.venue) && <option>{race.venue}</option>}
          </select>
        </label>
        <label className="field">
          馬場
          <select
            value={race.surface}
            onChange={(e) => setRace({ ...race, surface: e.target.value as Race["surface"] })}
          >
            <option>芝</option>
            <option>ダ</option>
            <option>障</option>
          </select>
        </label>
        <label className="field">
          距離(m)
          <input
            type="number"
            step={100}
            list="distances"
            value={race.distance || ""}
            onChange={(e) => setRace({ ...race, distance: Number(e.target.value) })}
          />
          <datalist id="distances">
            {distancesFor(race.venue, race.surface).map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <label className="field">
          馬場状態
          <select
            value={race.going ?? "良"}
            onChange={(e) => setRace({ ...race, going: e.target.value as Going })}
          >
            {GOINGS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <p className="hint course-status">
          {course
            ? `コース補正あり: ${course.venue}${course.track ? course.track + "回り" : ""} ${course.surface}${course.distance}m`
            : race.venue && race.distance
              ? "このコースはコース表にないため、コース補正なしで予想しています"
              : "競馬場・馬場・距離を入れると、コースの特徴を予想に反映します"}
        </p>
      </section>

      <PasteImport horses={race.horses} onImported={(horses) => setRace({ ...race, horses })} />

      {race.horses.length > 0 && (
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
      )}

      <HorseTable
        horses={race.horses}
        analyses={prediction.analyses}
        jockeyNotes={jockeyNotes}
        onJockeyNote={setJockeyNote}
        onChange={(horses) => setRace({ ...race, horses })}
      />

      {race.horses.length > 0 && (
        <ResultCheck
          horses={race.horses}
          result={race.result}
          predictedFirst={prediction.firstCorner}
          predictedFinal={prediction.finalCorner}
          title={title}
          onChange={(result) => setRace({ ...race, result })}
        />
      )}
    </div>
  );
}
