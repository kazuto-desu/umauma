import type { Race } from "../lib/types";

interface Props {
  races: Race[];
  currentId?: string;
  onSave: () => void;
  onOpen: (race: Race) => void;
  onDelete: (id: string) => void;
}

export function SavedRaces({ races, currentId, onSave, onOpen, onDelete }: Props) {
  return (
    <details className="card saved">
      <summary>
        <h2>保存したレース ({races.length})</h2>
      </summary>
      <button onClick={onSave}>{currentId ? "上書き保存" : "このレースを保存"}</button>
      {races.length === 0 ? (
        <p className="hint">まだ保存したレースはありません。</p>
      ) : (
        <ul className="saved-list">
          {races.map((r) => (
            <li key={r.id} className={r.id === currentId ? "current" : undefined}>
              <span className="saved-title">
                {[r.date, r.venue, r.surface && r.distance ? `${r.surface}${r.distance}` : "", r.name || "(名前なし)"]
                  .filter(Boolean)
                  .join(" ")}
                {r.result?.firstCorner && <span className="badge">結果あり</span>}
              </span>
              <button className="ghost" onClick={() => onOpen(r)}>
                開く
              </button>
              <button
                className="ghost"
                onClick={() => {
                  if (confirm(`「${r.name || "名前なし"}」を削除しますか？`)) onDelete(r.id!);
                }}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
