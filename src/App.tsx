import { useEffect, useMemo, useState } from "react";
import { FormationView } from "./components/FormationView";
import { HorseTable } from "./components/HorseTable";
import { PasteImport } from "./components/PasteImport";
import { DEFAULT_OPTIONS, predict } from "./lib/predict";
import { SAMPLE_RACE } from "./lib/sample";
import type { PredictOptions, Race } from "./lib/types";

const RACE_STORAGE = "umauma.race";

function loadRace(): Race {
  try {
    const saved = localStorage.getItem(RACE_STORAGE);
    if (saved) return JSON.parse(saved);
  } catch {
    /* 壊れていたらサンプルから */
  }
  return SAMPLE_RACE;
}

export default function App() {
  const [race, setRace] = useState<Race>(loadRace);
  const [options, setOptions] = useState<PredictOptions>(DEFAULT_OPTIONS);

  useEffect(() => {
    try {
      localStorage.setItem(RACE_STORAGE, JSON.stringify(race));
    } catch {
      /* 保存できなくても動作には影響しない */
    }
  }, [race]);

  const prediction = useMemo(() => predict(race.horses, options), [race.horses, options]);
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
          <button className="ghost" onClick={() => setRace({ name: "", venue: "", surface: "芝", distance: 0, horses: [] })}>
            新規
          </button>
        </div>
      </header>

      <section className="card race-info">
        <label className="field">
          レース名
          <input value={race.name} onChange={(e) => setRace({ ...race, name: e.target.value })} />
        </label>
        <label className="field">
          競馬場
          <input value={race.venue} onChange={(e) => setRace({ ...race, venue: e.target.value })} />
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
            value={race.distance || ""}
            onChange={(e) => setRace({ ...race, distance: Number(e.target.value) })}
          />
        </label>
      </section>

      <PasteImport horses={race.horses} onImported={(horses) => setRace({ ...race, horses })} />

      {race.horses.length > 0 && (
        <>
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
        onChange={(horses) => setRace({ ...race, horses })}
      />
    </div>
  );
}
