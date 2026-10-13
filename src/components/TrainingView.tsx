import { useState } from "react";
import { frameOf } from "../lib/frame";
import { splitByEntries, splitByHorseNames } from "../lib/paste";
import { addCourseSamples, loadCourseSamples } from "../lib/storage";
import {
  MIN_COURSE_SAMPLES,
  courseBaselines,
  courseKey,
  lapShape,
  latestWorkout,
  parseWorkouts,
  sampleKey,
  sampleOf,
  scoreWorkout,
  segmentsOf,
  trainingCommentOf,
} from "../lib/training";
import type { CourseBaseline, CourseSample, LapScore } from "../lib/training";
import type { Horse, Workout } from "../lib/types";

interface Props {
  horses: Horse[];
  onChange: (horses: Horse[]) => void;
}

type Parsed = Pick<Horse, "workouts" | "trainingComment" | "trainingTrend">;

function parseSegment(segment: string, name: string): Parsed {
  const { comment, trend } = trainingCommentOf(segment, name);
  return { workouts: parseWorkouts(segment), trainingComment: comment, trainingTrend: trend };
}

export function TrainingView({ horses, onChange }: Props) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  // 表の馬と合わなかったときに、その場だけ表示する分
  const [loose, setLoose] = useState<{ label: string; parsed: Parsed }[]>([]);
  const [samples, setSamples] = useState<Record<string, CourseSample>>(loadCourseSamples);
  const baselines = courseBaselines(Object.values(samples));
  const offsetOf = offsetFinder(baselines);

  // 読み込んだ追い切りをコースごとの時計として貯める
  const remember = (list: { name: string; workouts?: Workout[] }[]) => {
    const add: Record<string, CourseSample> = {};
    for (const { name, workouts } of list)
      for (const w of workouts ?? []) {
        const sample = sampleOf(w);
        if (sample) add[sampleKey(name, w)] = sample;
      }
    if (Object.keys(add).length > 0) setSamples(addCourseSamples(add));
  };

  const read = () => {
    // 1. 表の馬名で分ける
    const byName = splitByHorseNames(text, horses)
      .map((s) => ({ horse: s.horse, parsed: parseSegment(s.segment, s.horse.name) }))
      .filter((p) => p.parsed.workouts!.length > 0);
    if (byName.length > 0) {
      remember(byName.map((p) => ({ name: p.horse.name, workouts: p.parsed.workouts })));
      onChange(horses.map((h) => ({ ...h, ...(byName.find((p) => p.horse === h)?.parsed ?? {}) })));
      done(`${byName.length}頭の調教を読み込みました。`);
      return;
    }
    // 2. 「馬番 馬名」で分ける。表が空なら出走馬として登録する
    const entries = splitByEntries(text).map((e) => ({ ...e, parsed: parseSegment(e.segment, e.name) }));
    if (entries.length > 0) remember(entries.map((e) => ({ name: e.name, workouts: e.parsed.workouts })));
    if (entries.length > 0 && horses.length === 0) {
      onChange(
        entries.map((e) => ({
          number: e.number,
          frame: frameOf(e.number, entries.length),
          name: e.name,
          pastRaces: [],
          ...e.parsed,
        })),
      );
      done(`${entries.length}頭を出走馬として登録し、調教を読み込みました。`);
      return;
    }
    if (entries.length > 0) {
      setLoose(entries.map((e) => ({ label: `${e.number} ${e.name}`, parsed: e.parsed })));
      setMessage("表の馬名と一致しなかったので、この場で表示します (保存はされません)。");
      return;
    }
    // 3. 馬に分けられなければ、時計だけでも表示する
    const all = parseWorkouts(text);
    setLoose(all.length > 0 ? [{ label: "", parsed: { workouts: all } }] : []);
    setMessage(
      all.length > 0
        ? `${all.length}本の追い切りをこの場で表示します (保存はされません)。`
        : "追い切りの時計が見つかりませんでした。「66.7 52.0 39.1」のような部分を含めてコピーしてください。",
    );
  };

  const done = (msg: string) => {
    setLoose([]);
    setMessage(msg);
    setText("");
  };

  const withWorkouts = horses.filter((h) => h.workouts?.length && !h.scratched);

  return (
    <section className="card">
      <p className="hint">
        競馬ブックなどの調教欄をコピーして貼り付けると、ゴールからの時計を区間ごとのラップに直して表示します。表に馬名が入っていれば馬ごとに分けて保存します。
      </p>
      <textarea rows={4} value={text} placeholder="調教欄を貼り付け" onChange={(e) => setText(e.target.value)} />
      <button disabled={!text.trim()} onClick={read}>
        読み込む
      </button>
      {message && <p className="hint">{message}</p>}

      <LapRanking horses={withWorkouts} offsetOf={offsetOf} />
      <CourseStats baselines={baselines} />

      {withWorkouts.map((h) => (
        <HorseWorkouts key={h.number} label={`${h.number} ${h.name}`} parsed={h} />
      ))}
      {loose.map((l, i) => (
        <HorseWorkouts key={i} label={l.label} parsed={l.parsed} />
      ))}
      {withWorkouts.length > 0 && (
        <button
          className="ghost"
          onClick={() =>
            onChange(horses.map(({ workouts: _w, trainingComment: _c, trainingTrend: _t, ...h }) => h))
          }
        >
          調教を消す
        </button>
      )}
    </section>
  );
}

/** コースごとの補正値を引く関数を作る */
export function offsetFinder(baselines: CourseBaseline[]) {
  return (w: Workout) => baselines.find((b) => b.course === courseKey(w.course))?.offset ?? 0;
}

/** 端末に貯めた調教コースの時計から補正値を引く関数を作る (予想画面用) */
export function storedOffsetFinder() {
  return offsetFinder(courseBaselines(Object.values(loadCourseSamples())));
}

/** 最終追い切りのラップの良さで1〜3位を出す */
export function LapRanking({
  horses,
  offsetOf,
  title = "いいラップ ランキング (最終追い切り)",
}: {
  horses: Horse[];
  offsetOf: (w: Workout) => number;
  title?: string;
}) {
  const ranked = horses
    .map((h) => {
      const w = latestWorkout(h.workouts)!;
      return { h, w, s: scoreWorkout(w, offsetOf(w)) };
    })
    .filter((x): x is typeof x & { s: LapScore } => x.s !== undefined)
    .sort((a, b) => a.s.score - b.s.score);
  if (ranked.length < 2) return null;
  return (
    <div className="lap-ranking">
      <h3>{title}</h3>
      <ol>
        {ranked.slice(0, 3).map(({ h, w, s }, i) => (
          <li key={h.number} className={`rank rank-${i + 1}`}>
            <span className="rank-no">{i + 1}</span>
            <span className="rank-body">
              <strong>
                {h.number} {h.name}
              </strong>
              <span className="rank-reasons">
                {[w.date, ...s.reasons].filter(Boolean).join("・")}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="muted">
        終いの1ハロン平均を軸に、加速した分 (1秒まで)・馬なり・併せ馬の先着はプラス、一杯・遅れ・道悪の時計はマイナスし、データの貯まったコースは平均との差を補正して比べています。目安としてご覧ください。
      </p>
    </div>
  );
}

/** コースごとの平均時計と、補正に使えているかどうか */
function CourseStats({ baselines }: { baselines: CourseBaseline[] }) {
  if (baselines.length === 0) return null;
  return (
    <details className="course-stats">
      <summary className="muted">調教コースの補正 ({baselines.length}コース)</summary>
      <table>
        <thead>
          <tr>
            <th>コース</th>
            <th>本数</th>
            <th>終い平均</th>
            <th>補正</th>
          </tr>
        </thead>
        <tbody>
          {baselines.map((b) => (
            <tr key={b.course}>
              <td>{b.course}</td>
              <td>{b.count}</td>
              <td>{b.mean.toFixed(2)}</td>
              <td>
                {b.count < MIN_COURSE_SAMPLES
                  ? `あと${MIN_COURSE_SAMPLES - b.count}本`
                  : b.offset === 0
                    ? "比べるコース待ち"
                    : `${b.offset > 0 ? "+" : ""}${b.offset.toFixed(2)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        調教を読み込むたびに、コースごとの終いの時計がこの端末に貯まります。{MIN_COURSE_SAMPLES}
        本以上貯まったコースが2つ以上になると、コース平均との差でランキングを補正します (マイナスは時計の出やすいコース)。
      </p>
    </details>
  );
}

function HorseWorkouts({ label, parsed }: { label: string; parsed: Parsed }) {
  const latest = latestWorkout(parsed.workouts);
  return (
    <div className="training-horse">
      {label && (
        <h3>
          {label}
          {parsed.trainingComment && <span className="training-comment"> {parsed.trainingComment}</span>}
          {parsed.trainingTrend && <span className="training-comment"> {parsed.trainingTrend}</span>}
        </h3>
      )}
      {parsed.workouts!.map((w, i) => (
        <WorkoutRow key={i} w={w} latest={w === latest} />
      ))}
    </div>
  );
}

function WorkoutRow({ w, latest }: { w: Workout; latest?: boolean }) {
  const shape = lapShape(w);
  const total = w.marks[0];
  return (
    <div className="workout">
      <div className="workout-head">
        {latest && <span className="badge">最終</span>}
        {w.beforeLastRace && <span className="badge badge-muted">前回</span>}
        {[w.date, w.course, `${total.furlong}F ${total.time.toFixed(1)}`, w.intensity].filter(Boolean).join("  ")}
        {shape && <span className={`shape shape-${shape}`}>{shape}</span>}
      </div>
      <div className="laps">
        {segmentsOf(w).map((s, i) => (
          <span
            key={i}
            className={`lap ${s.perFurlong < 12.5 ? "lap-fast" : s.perFurlong < 13.5 ? "lap-mid" : "lap-slow"}`}
            title={s.span > 1 ? `${s.span}ハロンまとめて ${s.total.toFixed(1)}秒 (1ハロン平均 ${s.perFurlong.toFixed(1)})` : undefined}
          >
            {s.span > 1 ? (
              <>
                <small>{s.span}F </small>
                {s.total.toFixed(1)}
                <small> (≒{s.perFurlong.toFixed(1)})</small>
              </>
            ) : (
              s.total.toFixed(1)
            )}
          </span>
        ))}
      </div>
      {w.partner && <div className="partner">併せ: {w.partner}</div>}
    </div>
  );
}
