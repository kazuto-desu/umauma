import { useState } from "react";
import { importPastRace, isDuplicate } from "../lib/bulkImport";
import { historyStats } from "../lib/historyStats";
import { saveRace } from "../lib/storage";
import type { Race } from "../lib/types";

/**
 * 過去レース取り込み。日付を入れて馬柱 (と結果) を貼るだけで、予想ページを通さずに保存していく。
 * 保存した馬柱の過去走は型の成績に使われる。
 */
export function BulkImport({ saved, onSaved }: { saved: Race[]; onSaved: (list: Race[]) => void }) {
  const [date, setDate] = useState("");
  const [line, setLine] = useState("");
  const [card, setCard] = useState("");
  const [result, setResult] = useState("");
  const [log, setLog] = useState<{ text: string; error?: boolean }[]>([]);
  const samples = historyStats(saved).samples;

  const add = (text: string, error?: boolean) => setLog((l) => [{ text, error }, ...l].slice(0, 8));

  const read = () => {
    const r = importPastRace({ card, result, date, line });
    if ("error" in r) return add(r.error, true);
    if (isDuplicate(r.race, saved)) return add(`${r.race.date} ${r.race.name} はもう保存されています。`, true);
    const { list } = saveRace(r.race);
    const added = historyStats(list).samples - samples;
    onSaved(list);
    add(`${r.race.date} ${r.race.name} を保存しました (${r.race.horses.length}頭・過去走 +${added}件${r.race.result?.finish ? "・結果あり" : ""})。`);
    setDate(r.race.date ?? date); // 同じ日のレースを続けて入れやすいように日付は残す
    setLine("");
    setCard("");
    setResult("");
  };

  return (
    <details className="card details-more bulk-import">
      <summary>
        <h2>過去レースをまとめて取り込む</h2>
      </summary>
      <p className="muted">
        過去のレースの馬柱を貼るだけで保存します (予想ページは通りません)。馬柱の過去走は「型の成績」に使われます。結果も貼ると、調教・展開の型や軸の重みの学習にも使えます。
      </p>
      <p className="bulk-count">
        今たまっている過去走: <strong>{samples}件</strong>
      </p>
      <div className="bulk-fields">
        <label>
          レースの日付 (必須)
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          レース (任意)
          <input value={line} placeholder="例: 川崎 5R ダ1400" onChange={(e) => setLine(e.target.value)} />
        </label>
      </div>
      <p className="muted">日付は馬柱の過去走 (「9/20」など年なし) の年を決めるのに使います。貼り付けに年付きの日付があればそちらを使います。</p>
      <label className="bulk-label">馬柱</label>
      <textarea rows={4} value={card} placeholder="過去のレースの馬柱を貼り付け" onChange={(e) => setCard(e.target.value)} />
      <label className="bulk-label">結果 (任意)</label>
      <textarea rows={3} value={result} placeholder="そのレースの結果を貼り付け (なくても可)" onChange={(e) => setResult(e.target.value)} />
      <div className="row">
        <button disabled={!card.trim()} onClick={read}>
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
    </details>
  );
}
