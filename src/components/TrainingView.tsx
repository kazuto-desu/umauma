import { useState } from "react";
import { splitByHorseNames } from "../lib/paste";
import { lapShape, lapsOf, latestWorkout, parseWorkouts } from "../lib/training";
import type { Horse, Workout } from "../lib/types";

interface Props {
  horses: Horse[];
  onChange: (horses: Horse[]) => void;
}

export function TrainingView({ horses, onChange }: Props) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  // 馬名で分けられなかったときに、その場だけ表示する追い切り
  const [loose, setLoose] = useState<Workout[]>([]);

  const read = () => {
    const segments = splitByHorseNames(text, horses);
    const parsed = segments.map((s) => ({ horse: s.horse, workouts: parseWorkouts(s.segment) }));
    const found = parsed.filter((p) => p.workouts.length > 0);
    if (found.length > 0) {
      onChange(horses.map((h) => found.find((p) => p.horse === h) ? { ...h, workouts: found.find((p) => p.horse === h)!.workouts } : h));
      setLoose([]);
      setMessage(`${found.length}頭の調教を読み込みました。`);
      setText("");
      return;
    }
    const all = parseWorkouts(text);
    setLoose(all);
    setMessage(
      all.length > 0
        ? `出走馬の馬名が見つからなかったので、${all.length}本の追い切りをこの場で表示します (保存はされません)。`
        : "追い切りの時計が見つかりませんでした。「66.5-51.8-38.6-12.9」のような部分を含めてコピーしてください。",
    );
  };

  const withWorkouts = horses.filter((h) => h.workouts?.length && !h.scratched);
  // 最終追い切りの終い1Fで順位を付ける
  const finals = withWorkouts
    .map((h) => ({ h, last: latestWorkout(h.workouts)!.marks.at(-1)!.time }))
    .sort((a, b) => a.last - b.last);

  return (
    <details className="card" open={withWorkouts.length > 0 || loose.length > 0}>
      <summary>
        <h2>調教ラップ</h2>
      </summary>
      <p className="hint">
        競馬ブックなどの調教欄をコピーして貼り付けると、ゴールからの時計を1ハロンごとのラップに直して表示します。表に馬名が入っていれば馬ごとに分けて保存します。
      </p>
      <textarea rows={4} value={text} placeholder="調教欄を貼り付け" onChange={(e) => setText(e.target.value)} />
      <button disabled={!text.trim()} onClick={read}>
        読み込む
      </button>
      {message && <p className="hint">{message}</p>}

      {finals.length > 1 && (
        <p className="training-rank">
          最終追い切りの終い1F:{" "}
          {finals.slice(0, 3).map(({ h, last }, i) => (
            <span key={h.number}>
              {i > 0 && "、"}
              {h.number} {h.name} <strong>{last.toFixed(1)}</strong>
            </span>
          ))}
        </p>
      )}

      {withWorkouts.map((h) => (
        <div key={h.number} className="training-horse">
          <h3>
            {h.number} {h.name}
          </h3>
          {h.workouts!.map((w, i) => (
            <WorkoutRow key={i} w={w} latest={w === latestWorkout(h.workouts)} />
          ))}
        </div>
      ))}
      {loose.length > 0 && (
        <div className="training-horse">
          {loose.map((w, i) => (
            <WorkoutRow key={i} w={w} />
          ))}
        </div>
      )}
      {withWorkouts.length > 0 && (
        <button className="ghost" onClick={() => onChange(horses.map(({ workouts: _, ...h }) => h))}>
          調教を消す
        </button>
      )}
    </details>
  );
}

function WorkoutRow({ w, latest }: { w: Workout; latest?: boolean }) {
  const laps = lapsOf(w);
  const shape = lapShape(laps);
  const total = w.marks[0];
  return (
    <div className="workout">
      <div className="workout-head">
        {latest && <span className="badge">最終</span>}
        {[w.date, w.course, `${total.furlong}F ${total.time.toFixed(1)}`, w.intensity].filter(Boolean).join("  ")}
        {shape && <span className={`shape shape-${shape}`}>{shape}</span>}
      </div>
      <div className="laps">
        {laps.map((l, i) => (
          <span
            key={i}
            className={`lap ${l.time < 12.5 ? "lap-fast" : l.time < 13.5 ? "lap-mid" : "lap-slow"}`}
            title={l.estimated ? "まとめて計測された区間を均等に割った推定値" : undefined}
          >
            {l.estimated ? "≒" : ""}
            {l.time.toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  );
}
