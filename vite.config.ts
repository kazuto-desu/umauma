import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages では /<repo名>/ 配下で配信されるため base を相対パスにしておく
export default defineConfig({
  plugins: [react()],
  base: "./",
});
