import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages では /<repo名>/ 配下で配信されるため base を相対パスにしておく
export default defineConfig({
  plugins: [react()],
  base: "./",
  // 画面の下に出す更新日時 (古い画面が残っていないか確かめる用)
  define: {
    __BUILD_TIME__: JSON.stringify(
      new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }),
    ),
  },
});
