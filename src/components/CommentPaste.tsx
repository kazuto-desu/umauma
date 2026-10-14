import { useState } from "react";
import { parseComments, readComment } from "../lib/comment";
import { frameOf } from "../lib/frame";
import type { Horse } from "../lib/types";

/** 厩舎コメントの貼り付けと読み取り結果 */
export function CommentPaste({ horses, onChange }: { horses: Horse[]; onChange: (h: Horse[]) => void }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const withComment = horses.filter((h) => h.stableComment);

  const read = () => {
    const list = parseComments(text);
    if (list.length === 0) {
      setMessage("コメントが見つかりませんでした。「○馬名【○○師】コメント」の部分を含めてコピーしてください。");
      return;
    }
    if (horses.length === 0) {
      const entries = list.filter((c) => c.number);
      onChange(
        entries.map((c) => ({
          number: c.number!,
          frame: c.frame ?? frameOf(c.number!, entries.length),
          name: c.name,
          pastRaces: [],
          stableComment: c.comment,
        })),
      );
      finish(`${entries.length}頭を出走馬として登録し、厩舎コメントを読み込みました。`);
      return;
    }
    const matched = list.filter((c) => horses.some((h) => h.name === c.name));
    if (matched.length === 0) {
      setMessage("表の馬名と一致するコメントがありませんでした。別のレースのコメントではないか確認してください。");
      return;
    }
    onChange(horses.map((h) => {
      const c = matched.find((x) => x.name === h.name);
      return c ? { ...h, stableComment: c.comment } : h;
    }));
    finish(`${matched.length}頭の厩舎コメントを読み込みました。`);
  };
  const finish = (msg: string) => {
    setText("");
    setMessage(msg);
  };

  return (
    <details className="card comment-paste" open={withComment.length > 0 || undefined}>
      <summary>
        <h2>厩舎コメント {withComment.length > 0 ? `(${withComment.length}頭)` : "(任意)"}</h2>
      </summary>
      <p className="hint">
        競馬ブックの厩舎コメントを貼り付けると、「前に行く」「控える」などの作戦とスタートの不安を位置取りに、状態の良し悪しを結論に少し反映します。
      </p>
      <textarea rows={3} value={text} placeholder="厩舎コメントを貼り付け" onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button disabled={!text.trim()} onClick={read}>
          読み込む
        </button>
        {withComment.length > 0 && (
          <button className="ghost" onClick={() => onChange(horses.map(({ stableComment: _, ...h }) => h))}>
            コメントを消す
          </button>
        )}
      </div>
      {message && <p className="hint">{message}</p>}
      {withComment.length > 0 && <CommentReadings horses={withComment} />}
    </details>
  );
}

/** 馬ごとの読み取り結果 */
export function CommentReadings({ horses }: { horses: Horse[] }) {
  return (
    <ul className="comment-list">
      {horses.map((h) => {
        const r = readComment(h.stableComment!);
        return (
          <li key={h.number}>
            <strong>
              {h.number} {h.name}
            </strong>
            <span className={`comment-tags${r.mood > 0 ? " good" : r.mood < 0 ? " bad" : ""}`}>
              {r.tags.length > 0 ? r.tags.join("・") : "特記なし"}
            </span>
            <span className="comment-text">{h.stableComment}</span>
          </li>
        );
      })}
    </ul>
  );
}
