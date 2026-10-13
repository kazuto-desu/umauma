import { JRA_VENUES, NAR_VENUES, VENUES, distancesFor, findCourse } from "../lib/courses";
import type { Going, Race } from "../lib/types";

const GOINGS: Going[] = ["良", "稍重", "重", "不良"];

export function RaceInfoForm({ race, setRace }: { race: Race; setRace: (r: Race) => void }) {
  const course = findCourse(race.venue, race.surface, race.distance);
  return (
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
      <p className="hint course-status">
        {course
          ? `コース補正あり: ${course.venue}${course.track ? course.track + "回り" : ""} ${course.surface}${course.distance}m`
          : race.venue && race.distance
            ? "このコースはコース表にないため、コース補正なしで予想しています"
            : "競馬場・馬場・距離を入れると、コースの特徴を予想に反映します"}
      </p>
    </section>
  );
}
