import { useState } from "react";
import type { Race } from "../lib/types";

const KEY_STORAGE = "umauma.apiKey";

function loadKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function ImageImport({ onImported }: { onImported: (race: Race) => void }) {
  const [apiKey, setApiKey] = useState(loadKey);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const saveKey = (k: string) => {
    setApiKey(k);
    try {
      localStorage.setItem(KEY_STORAGE, k);
    } catch {
      /* 保存できなくても今回の入力は使える */
    }
  };

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      // SDK は重いので読み取り時に初めて読み込む
      const { extractRaceFromImages, fileToImage } = await import("../lib/extract");
      const images = await Promise.all(files.map(fileToImage));
      onImported(await extractRaceFromImages(apiKey, images));
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>馬柱の画像から取り込む</h2>
      <p className="hint">
        出馬表・馬柱のスクリーンショットを選ぶと、Claude が枠・馬番・馬名・過去の通過順を読み取ります。
        縦に長い場合は数枚に分けると精度が上がります。読み取り後は下の表で確認・修正してください。
      </p>
      <label className="field">
        Anthropic APIキー
        <input
          type="password"
          value={apiKey}
          placeholder="sk-ant-..."
          onChange={(e) => saveKey(e.target.value)}
        />
      </label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      <button disabled={!apiKey || files.length === 0 || busy} onClick={run}>
        {busy ? "読み取り中…（1〜2分かかることがあります）" : `読み取る (${files.length}枚)`}
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
