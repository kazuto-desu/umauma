import { useState } from "react";
import { parsePastedCard } from "../lib/paste";
import type { Horse } from "../lib/types";

interface Props {
  horses: Horse[];
  onImported: (horses: Horse[]) => void;
}

export function PasteImport({ horses, onImported }: Props) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [previous, setPrevious] = useState<Horse[] | null>(null);

  const run = () => {
    const result = parsePastedCard(text, horses);
    if (!result) {
      setMessage("出走馬を見つけられませんでした。馬番と馬名が入った部分をコピーしてください。");
      return;
    }
    setPrevious(horses);
    onImported(result.horses);
    setText("");
    setMessage(
      result.mode === "new"
        ? `${result.horses.length}頭を読み込み、うち${result.withPassing}頭の通過順を取得しました。`
        : `${result.withPassing}頭の通過順を更新しました。`,
    );
  };

  return (
    <section className="card">
      <h2>コピペで取り込む</h2>
      <p className="hint">
        競馬サイトの出馬表・馬柱を全選択してコピーし、ここに貼り付けてください。スクショしかない場合は、iPhone
        の写真アプリで画像の文字を長押しするとコピーできます。表に馬名が入っていれば、その馬名を目印に通過順だけを更新します。
      </p>
      <textarea
        rows={6}
        value={text}
        placeholder="ここに貼り付け"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <button disabled={!text.trim()} onClick={run}>
          読み込む
        </button>
        {previous && (
          <button
            className="ghost"
            onClick={() => {
              onImported(previous);
              setPrevious(null);
              setMessage("読み込む前に戻しました。");
            }}
          >
            元に戻す
          </button>
        )}
      </div>
      {message && <p className="hint">{message}</p>}
    </section>
  );
}
