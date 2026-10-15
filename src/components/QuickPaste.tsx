import { useState } from "react";
import { KIND_LABEL, filledKinds, importAny } from "../lib/importer";
import type { ImportKind } from "../lib/importer";
import { addCourseSamples } from "../lib/storage";
import { sampleKey, sampleOf } from "../lib/training";
import type { CourseSample } from "../lib/training";
import type { Race } from "../lib/types";

const ORDER: ImportKind[] = ["card", "training", "comments", "paddock", "odds", "result"];
const HINT: Record<ImportKind, string> = {
  card: "前日・朝",
  training: "前日・朝",
  comments: "前日・朝",
  paddock: "直前",
  odds: "直前",
  result: "レース後",
};

/**
 * なんでも貼る欄。馬柱・調教・厩舎コメント・パドック・オッズ・結果を中身から見分けて読み込む。
 * 何が入っているかをチェックで見せる。
 */
export function QuickPaste({ race, setRace, compact }: { race: Race; setRace: (r: Race) => void; compact?: boolean }) {
  const [text, setText] = useState("");
  const [log, setLog] = useState<{ kind?: ImportKind; message: string; error?: boolean }[]>([]);
  const [previous, setPrevious] = useState<Race | null>(null);
  const filled = filledKinds(race);

  const read = () => {
    const r = importAny(text, race);
    if ("error" in r) {
      setLog((l) => [{ message: r.error, error: true }, ...l].slice(0, 4));
      return;
    }
    // 調教の時計はコースごとの基準時計づくりにも貯める
    if (r.workouts) {
      const add: Record<string, CourseSample> = {};
      for (const { name, workouts } of r.workouts)
        for (const w of workouts ?? []) {
          const s = sampleOf(w);
          if (s) add[sampleKey(name, w)] = s;
        }
      if (Object.keys(add).length > 0) addCourseSamples(add);
    }
    setPrevious(race);
    setRace(r.race);
    setText("");
    setLog((l) => [{ kind: r.kind, message: r.message }, ...l].slice(0, 4));
  };

  return (
    <section className={`card quick-paste${compact ? " compact" : ""}`}>
      <div className="card-title">
        <h2>{compact ? "直前情報・結果を貼る" : "なんでも貼る"}</h2>
        <span className="muted">種類は自動で見分けます</span>
      </div>
      <ul className="kind-checks">
        {ORDER.map((k) => (
          <li key={k} className={filled[k] ? "on" : ""}>
            <span className="kind-mark">{filled[k] ? "✓" : ""}</span>
            {k === "comments" ? "コメント" : KIND_LABEL[k]}
            <span className="kind-when">{HINT[k]}</span>
          </li>
        ))}
      </ul>
      <textarea
        rows={compact ? 3 : 6}
        value={text}
        placeholder={compact ? "パドック評価・オッズ・結果を貼り付け" : "競馬ブックなどの馬柱・調教・厩舎コメント・パドック・オッズ・結果を、1つずつここに貼り付け"}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <button disabled={!text.trim()} onClick={read}>
          読み込む
        </button>
        {previous && (
          <button
            className="ghost"
            onClick={() => {
              setRace(previous);
              setPrevious(null);
              setLog((l) => [{ message: "直前の読み込みを取り消しました。" }, ...l].slice(0, 4));
            }}
          >
            取り消す
          </button>
        )}
      </div>
      {log.length > 0 && (
        <ul className="import-log">
          {log.map((x, k) => (
            <li key={k} className={x.error ? "error" : undefined}>
              {x.kind && <span className="import-kind">{KIND_LABEL[x.kind]}</span>}
              {x.message}
            </li>
          ))}
        </ul>
      )}
      {!compact && (
        <p className="muted">
          最低限は「馬柱」と「調教」があれば予想ページが使えます。厩舎コメント・パドック・オッズは、あれば足してください (直前情報は予想ページからも貼れます)。
        </p>
      )}
    </section>
  );
}
