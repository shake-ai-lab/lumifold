import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri が devUrl として読みに来るので、ポートは固定する
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Windows の画像書き込み中の EBUSY を避ける。cargo 等の生成物は監視しない。
    watch: { ignored: ["**/src-tauri/**", "**/tools/**"], usePolling: true, interval: 300, binaryInterval: 1000 },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "chrome105",
    sourcemap: true,
  },
});
