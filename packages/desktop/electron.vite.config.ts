import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["ensemble"] })],
    resolve: {
      alias: {
        ensemble: resolve(__dirname, "../../src/index.ts"),
      },
    },
    build: {
      outDir: "dist/main",
      lib: {
        entry: "src/main/index.ts",
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      lib: {
        entry: "src/preload/index.ts",
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: "src/renderer",
    build: {
      outDir: resolve(__dirname, "dist/renderer"),
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
