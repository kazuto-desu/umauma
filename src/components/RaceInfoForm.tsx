import { JRA_VENUES, NAR_VENUES, VENUES, distancesFor, findCourse } from "../lib/courses";
import { useState } from "react";
import { applyRaceLine, parseRaceLine } from "../lib/raceLine";
import type { Going, Race } from "../lib/types";

const GOINGS: Going[] = ["良", "稍重", "重", "不良"];

export function RaceInfoForm({ race, setRace }: { race: Race; setRace: (r: Race) => void }) {
  const course = findCourse(race.venue, race.surface, race.distance);
  const [line, setLine] = useState("");
  const chips: [string, string | undefined][] = [
    ["競馬場", race.venue],
    ["レース", race.name],
    ["コース", race.distance ? `${race.surface}${race.distance}m` : undefined],
    ["クラス", race.raceClass],
    ["日付", race.date?.slice(5).replace("-", "/")],
  ];
  return (
    <>
    <section className="card race-quick">
      <label className="field">
        1行で入力
        <input
          value={line}
          placeholder="例: 川崎 5R ダ1400 C2三"
          onChange={(e) => {
            setLine(e.target.value);
            setRace(applyRaceLine(race, parseRaceLine(e.target.value)));
          }}
        />
      </label>
      <p className="hint">競馬場・R・距離・クラスを順番自由で。出馬表のレース名の行をそのまま貼っても読めます。</p>
      <ul className="race-chips">
        {chips.map(([label, v]) => (
          <li key={label} className={v ? "on" : ""}>
            <span className="race-chip-label">{label}</span>
            {v || "未入力"}
          </li>
        ))}
      </ul>
      <div className="going-buttons" role="group" aria-label="馬場状態">
        {GOINGS.map((g) => (
          <button key={g} className={(race.going ?? "良") === g ? "on" : "ghost"} onClick={() => setRace({ ...race, going: g })}>
            {g}
          </button>
        ))}
      </div>
      <p className="hint course-status">
        {course
          ? `コース補正あり: ${course.venue}${course.track ? course.track + "回り" : ""} ${course.surface}${course.distance}m`
          : race.venue && race.distance
            ? "このコースはコース表にないため、コース補正なしで予想しています"
            : "競馬場と距離が入れば十分です (クラスは昇級・降級の判定に使います)"}
      </p>
    </section>
    <details className="card details-more">
      <summary>
        <h2>細かく直す</h2>
      </summary>
    <section className="race-info">
      <label className="field">
        レース名
        <input value={race.name} onChange={(e) => setRace({ ...race, name: e.target.value })} />
      </label>
      <label className="field">
        クラス
        <input
          value={race.raceClass ?? ""}
          placeholder="例: C2三、B3、2歳、1勝"
          onChange={(e) => setRace({ ...race, raceClass: e.target.value })}
        />
      </label>
      <label className="field">
        日付
        <input type="date" value={race.date ?? ""} onChange={(e) => setRace({ ...race, date: e.target.value })} />
      </label>
      <label className="field">
        競馬場
        <select value={race.venue} onChange={(e) => setRace({ ...race, venue: e.target.value })}>
          <option value="">選択</option>
          <optgroup label="中央 (JRA)">
            {JRA_VENUES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </optgroup>
          <optgroup label="地方">
            {NAR_VENUES.map((v) => (
              <option key={v} value={v}>
                {v === "帯広" ? "帯広 (ばんえい)" : v}
              </option>
            ))}
          </optgroup>
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
    </section>
    </details>
    </>
  );
}
