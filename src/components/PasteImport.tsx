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
      <p className="hint">
        競馬サイトの出馬表・馬柱 (過去の成績) を全選択してコピーし、ここに貼り付けてください。
        {horses.some((h) => h.name)
          ? "調教で登録した馬名を目印に、過去の通過順と騎手を取り込みます。"
          : "馬番・馬名から出走馬を登録し、過去の通過順を取り込みます。"}
        スクショしかない場合は、iPhone の写真アプリで画像の文字を長押しするとコピーできます。
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
