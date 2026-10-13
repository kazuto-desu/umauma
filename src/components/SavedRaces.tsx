import { useRef, useState } from "react";
import { exportAll, importAll } from "../lib/storage";
import type { Race } from "../lib/types";

interface Props {
  races: Race[];
  currentId?: string;
  onSave: () => void;
  onOpen: (race: Race) => void;
  onDelete: (id: string) => void;
}

export function SavedRaces({ races, currentId, onSave, onOpen, onDelete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  const download = () => {
    const blob = new Blob([exportAll()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `umauma-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000); // すぐ解放すると Safari で保存が止まることがある
    setMessage("バックアップを書き出しました。ファイルは iCloud Drive などに保存しておくと安心です。");
  };

  const restore = async (file: File) => {
    try {
      const { races: n } = importAll(await file.text());
      alert(`バックアップから戻しました (保存したレース ${n}件)。画面を読み込み直します。`);
      location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "ファイルを読み込めませんでした");
    }
  };

  return (
    <details className="card saved">
      <summary>
        <h2>保存したレース ({races.length})</h2>
      </summary>
      <p className="hint">
        出走馬を登録したレースは自動で保存されます。結果を入れる前に別のレースを予想しても、ここから続きを開けます。
      </p>
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
                {r.result?.firstCorner || r.result?.finish ? (
                  <span className="badge">結果あり</span>
                ) : (
                  <span className="badge badge-muted">予想中</span>
                )}
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
      <div className="backup">
        <h3>バックアップ</h3>
        <p className="muted">
          保存したレース・結果・騎手メモ・調教コースの時計は、この端末のブラウザの中にだけ保存されています。機種変更やデータ消去に備えて、ときどき書き出しておいてください。
        </p>
        <div className="row">
          <button className="ghost" onClick={download}>
            書き出す
          </button>
          <button className="ghost" onClick={() => fileRef.current?.click()}>
            ファイルから戻す
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restore(f);
              e.target.value = "";
            }}
          />
        </div>
        {message && <p className="hint">{message}</p>}
      </div>
    </details>
  );
}
