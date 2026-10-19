import { useMemo, useState } from "react";
import { importPastRace, importResultOnly, isDuplicate } from "../lib/bulkImport";
import { VENUES } from "../lib/courses";
import { loadDayNotes, saveDayNote, saveRace } from "../lib/storage";
import type { DayNote } from "../lib/storage";
import { collectRuns, dayTendencies, filterRuns, tendencyOf, todayIso, todaysRaces } from "../lib/tendency";
import type { BucketStat, GoingGroup, RunRecord, Tendency } from "../lib/tendency";
import type { Going, Race } from "../lib/types";

const GOINGS: Going[] = ["良", "稍重", "重", "不良"];
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "－");

/**
 * 溜まったデータ (保存したレースの結果・馬柱の過去走) と、その日の結果・馬場メモから、
 * コースの脚質・枠の傾向と、当日のトラックバイアスを見る画面。
 */
export function TendencyView({ saved, onSaved }: { saved: Race[]; onSaved: (list: Race[]) => void }) {
  const runs = useMemo(() => collectRuns(saved), [saved]);
  const venues = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of runs) if (r.venue) count.set(r.venue, (count.get(r.venue) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  }, [runs]);

  const [venue, setVenue] = useState(() => saved.find((r) => r.venue)?.venue ?? "川崎");
  const [date, setDate] = useState(todayIso);
  const courses = useMemo(() => coursesAt(runs, venue), [runs, venue]);
  const [course, setCourse] = useState<string>("");
  const picked = courses.find((c) => c.key === course) ?? courses[0];
  const [going, setGoing] = useState<GoingGroup | "">("");

  const dayKey = `${date}|${venue}`;
  const [notes, setNotes] = useState(loadDayNotes);
  const note: DayNote = notes[dayKey] ?? {};
  const setNote = (patch: Partial<DayNote>) => setNotes(saveDayNote(dayKey, { ...note, ...patch }));

  const today = tendencyOf(filterRuns(runs, { venue, date }));
  const todayDay = dayTendencies(runs, venue).find((d) => d.date === date);
  const races = todaysRaces(saved, date, venue);
  const courseT = picked ? tendencyOf(filterRuns(runs, { venue, surface: picked.surface, distance: picked.distance, ...(going ? { going } : {}) })) : undefined;
  const days = dayTendencies(runs, venue).slice(0, 12);

  return (
    <>
      <section className="card tendency-conditions">
        <div className="card-title">
          <h2>競馬場と日付</h2>
          <span className="muted">溜まった走り {runs.length}件</span>
        </div>
        <div className="bulk-fields">
          <label>
            競馬場
            <input list="tendency-venues" value={venue} onChange={(e) => setVenue(e.target.value.trim())} />
            <datalist id="tendency-venues">
              {[...new Set([...venues, ...VENUES])].map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
          <label>
            日付
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>今日の馬場</h2>
          <span className="muted">
            {venue} {date}
          </span>
        </div>
        <div className="going-buttons" role="group" aria-label="馬場状態">
          {GOINGS.map((g) => (
            <button key={g} className={note.going === g ? "on" : "ghost"} onClick={() => setNote({ going: note.going === g ? undefined : g })}>
              {g}
            </button>
          ))}
        </div>
        <div className="bulk-fields">
          <label>
            含水率
            <input value={note.moisture ?? ""} placeholder="例: 8.5 / 4角 7.2・ゴール前 8.0" onChange={(e) => setNote({ moisture: e.target.value })} />
          </label>
        </div>
        <label className="bulk-label">メモ・見た印象</label>
        <textarea rows={2} value={note.memo ?? ""} placeholder="例: 内が重い。4角で外に出した馬が伸びる" onChange={(e) => setNote({ memo: e.target.value })} />
      </section>

      <section className="card today-tendency">
        <div className="card-title">
          <h2>今日の傾向</h2>
          <span className="muted">結果を入れた{races.length}レースから</span>
        </div>
        {races.length === 0 ? (
          <p className="muted">今日のレースの結果を下の「データを貼る」に貼ると、前残り・差し、内・外の傾向が出ます。</p>
        ) : (
          <>
            <ul className="tendency-labels">
              {todayDay && todayDay.labels.length > 0 ? (
                todayDay.labels.map((l) => (
                  <li key={l} className="on">
                    {l}
                  </li>
                ))
              ) : (
                <li>{races.length < 3 ? "まだはっきりしない" : "目立った偏りなし"}</li>
              )}
            </ul>
            {races.length < 3 && <p className="muted">3レース以上たまると判定がはっきりします。</p>}
            <table className="stats-table">
              <thead>
                <tr>
                  <th>レース</th>
                  <th>1着</th>
                  <th>2着</th>
                  <th>3着</th>
                </tr>
              </thead>
              <tbody>
                {races.map((r) => (
                  <tr key={r.name}>
                    <td>
                      {r.name.replace(venue, "")}
                      <span className="recent-sub">
                        {r.surface}
                        {r.distance ?? ""}
                      </span>
                    </td>
                    {r.top.map((t) => (
                      <td key={t.number}>
                        {t.number}番
                        <span className="recent-sub">{t.finalRank ? `4角${t.finalRank}番手` : "－"}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <BucketTables t={today} small />
          </>
        )}
      </section>

      <section className="card course-tendency">
        <div className="card-title">
          <h2>コース傾向</h2>
          <span className="muted">{venue}</span>
        </div>
        {courses.length === 0 ? (
          <p className="muted">{venue}の走りがまだありません。馬柱や結果を貼るとたまっていきます。</p>
        ) : (
          <>
            <ul className="race-chips tendency-courses">
              {courses.map((c) => (
                <li key={c.key} className={picked?.key === c.key ? "on" : ""}>
                  <button className="chip-button" onClick={() => setCourse(c.key)}>
                    {c.label}
                    <span className="race-chip-label">{c.count}件</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="seg-tabs" role="tablist">
              {(["", "良", "道悪"] as const).map((g) => (
                <button key={g || "all"} role="tab" className={going === g ? "on" : ""} onClick={() => setGoing(g)}>
                  {g || "全部の馬場"}
                </button>
              ))}
            </div>
            {courseT && <CourseSummary t={courseT} />}
            {courseT && <BucketTables t={courseT} />}
          </>
        )}
      </section>

      <details className="card details-more">
        <summary>
          <h2>開催日ごとの傾向 ({venue})</h2>
        </summary>
        <p className="muted">馬柱の過去走と結果から、その日に3着以内だった馬の位置取り・枠を普段と比べています。頭数が少ない日は参考程度に。</p>
        {days.length === 0 ? (
          <p className="muted">まだありません。</p>
        ) : (
          <table className="stats-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>馬場</th>
                <th>傾向</th>
                <th>件数</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const n = notes[`${d.date}|${venue}`];
                return (
                  <tr key={d.date}>
                    <td>
                      {d.date.slice(5).replace("-", "/")}
                      {n?.memo && <span className="recent-sub">{n.memo}</span>}
                    </td>
                    <td>{n?.going ?? d.going ?? "－"}</td>
                    <td>{d.labels.join("・") || "偏りなし"}</td>
                    <td>{d.runs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </details>

      <PasteCard venue={venue} date={date} saved={saved} onSaved={onSaved} />
    </>
  );
}

function coursesAt(runs: RunRecord[], venue: string) {
  const map = new Map<string, { key: string; label: string; surface?: "芝" | "ダ" | "障"; distance: number; count: number }>();
  for (const r of runs) {
    if (r.venue !== venue || !r.distance) continue;
    const key = `${r.surface ?? ""}${r.distance}`;
    const c = map.get(key) ?? { key, label: `${r.surface ?? ""}${r.distance}`, surface: r.surface, distance: r.distance, count: 0 };
    c.count++;
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** 一番来ている脚質・枠をひとことで */
function CourseSummary({ t }: { t: Tendency }) {
  const best = (list: BucketStat[]) =>
    list.filter((b) => b.count >= 5).sort((a, b) => b.top3 / b.count - a.top3 / a.count)[0];
  const s = best(t.styles);
  const g = best(t.gates);
  const lift = (b?: BucketStat) => (b && t.base > 0 ? b.top3 / b.count / t.base : 0);
  const words = [
    s && lift(s) >= 1.2 ? `${s.label}が来やすい` : "",
    g && lift(g) >= 1.2 ? `${g.label}枠が来やすい` : "",
  ].filter(Boolean);
  return (
    <p className="tendency-summary">
      {t.runs < 20 ? "まだ件数が少ないので参考程度に。" : ""}
      {words.length > 0 ? words.join("・") : t.runs >= 20 ? "脚質・枠の偏りは小さめ" : ""}
      <span className="muted">
        {" "}
        ({t.runs}件・{t.days}日分・全体の3着内率{Math.round(t.base * 100)}%)
      </span>
    </p>
  );
}

function BucketTables({ t, small }: { t: Tendency; small?: boolean }) {
  const table = (title: string, list: BucketStat[]) => (
    <table className="stats-table">
      <thead>
        <tr>
          <th>{title}</th>
          <th>頭数</th>
          <th>3着内</th>
          <th>勝率</th>
        </tr>
      </thead>
      <tbody>
        {list.map((b) => {
          const rate = b.count > 0 ? b.top3 / b.count : undefined;
          const enough = b.count >= (small ? 3 : 8);
          const good = enough && rate !== undefined && t.base > 0 && rate >= t.base * 1.3;
          const bad = enough && rate !== undefined && t.base > 0 && rate <= t.base * 0.7;
          return (
            <tr key={b.label}>
              <td>{b.label}</td>
              <td>{b.count}</td>
              <td className={good ? "rate-good" : bad ? "rate-bad" : undefined}>{pct(b.top3, b.count)}</td>
              <td>{pct(b.wins, b.count)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  const hasGates = t.gates.some((g) => g.count > 0);
  return (
    <div className="bucket-tables">
      {table("脚質 (1角の位置)", t.styles)}
      {hasGates ? table("枠 (馬番の内外)", t.gates) : <p className="muted">枠の傾向は、馬番が載っている馬柱か結果がたまると出ます。</p>}
    </div>
  );
}

/** 馬柱 (溜まったデータ) か、その日の結果を貼る */
function PasteCard({ venue, date, saved, onSaved }: { venue: string; date: string; saved: Race[]; onSaved: (list: Race[]) => void }) {
  const [text, setText] = useState("");
  const [line, setLine] = useState("");
  const [log, setLog] = useState<{ text: string; error?: boolean }[]>([]);
  const add = (t: string, error?: boolean) => setLog((l) => [{ text: t, error }, ...l].slice(0, 6));

  const read = () => {
    // 結果を先に見る (結果の表を馬柱と取り違えないように。馬柱が結果と読まれることはない)
    const result = importResultOnly({ text, date, venue, line });
    const r = "error" in result ? importPastRace({ card: text, date, line: `${venue} ${line}` }) : result;
    if ("error" in r) return add("馬柱か結果として読めませんでした。", true);
    if (isDuplicate(r.race, saved)) return add(`${r.race.date} ${r.race.name} はもう保存されています。`, true);
    const before = collectRuns(saved).length;
    const { list } = saveRace(r.race);
    onSaved(list);
    const kind = "error" in result ? "馬柱" : "結果";
    add(`${kind}: ${r.race.date} ${r.race.name} を保存しました (走り +${collectRuns(list).length - before}件)。`);
    setText("");
    setLine("");
  };

  return (
    <section className="card">
      <div className="card-title">
        <h2>データを貼る</h2>
        <span className="muted">
          {venue} {date}
        </span>
      </div>
      <p className="muted">
        今日のレースの結果 (着順・通過順) を貼ると「今日の傾向」に、馬柱を貼ると過去走が「コース傾向」にたまります。日付と競馬場は上で選んだものを使います。
      </p>
      <label className="bulk-label">レース (任意)</label>
      <input value={line} placeholder="例: 5R ダ1400" onChange={(e) => setLine(e.target.value)} />
      <textarea rows={4} value={text} placeholder="結果か馬柱を貼り付け" onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button disabled={!text.trim()} onClick={read}>
          取り込んで保存
        </button>
      </div>
      {log.length > 0 && (
        <ul className="import-log">
          {log.map((x, k) => (
            <li key={k} className={x.error ? "error" : undefined}>
              {x.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
