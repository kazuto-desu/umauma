import { useEffect, useState } from "react";

/** 公開中の index.html が読み込んでいるスクリプト名 (ビルドごとにハッシュが変わる) */
function scriptOf(html: string): string | undefined {
  return /<script[^>]+src="([^"]*assets\/index-[^"]+\.js)"/.exec(html)?.[1]?.split("/").pop();
}

/** キャッシュされた古い index.html を避けて読み込み直す (入力中のデータはブラウザに残る) */
export function reloadLatest() {
  location.replace(`${location.pathname}?v=${Date.now()}`);
}

/**
 * 新しい版が公開されていたら知らせる。スマホのホーム画面から開いたときなどに
 * 古い画面が残り続けるのを防ぐ。キャッシュを使わずに index.html を取り直して比べる。
 */
export function UpdateBanner() {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    const current = scriptOf(document.documentElement.outerHTML);
    if (!current) return; // 開発中 (vite dev) は比べない
    const check = async () => {
      try {
        const res = await fetch(`./index.html?check=${Date.now()}`, { cache: "no-store" });
        const latest = scriptOf(await res.text());
        if (latest && latest !== current) setHasUpdate(true);
      } catch {
        /* 圏外などで確認できなくても何もしない */
      }
    };
    check();
    // 開き直したとき・戻ってきたとき (スマホのタブ復帰を含む) と、開いている間は3分ごとに確かめる
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    const timer = window.setInterval(onVisible, 3 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  if (!hasUpdate) return null;
  return (
    <div className="update-banner">
      新しい版があります
      <button
        onClick={reloadLatest}
      >
        更新する
      </button>
    </div>
  );
}
