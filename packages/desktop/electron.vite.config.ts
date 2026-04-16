import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["ensemble", "superjson"] })],
    resolve: {
      alias: {
        ensemble: resolve(__dirname, "../../src/index.ts"),
      },
    },
    build: {
      outDir: "out/main",
      sourcemap: true,
      lib: {
        entry: "src/main/index.ts",
        formats: ["cjs"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  preload: {
    // Sandboxed preloads cannot require arbitrary node_modules — electron-trpc
    // must be bundled into the preload script itself.
    plugins: [externalizeDepsPlugin({ exclude: ["electron-trpc"] })],
    build: {
      outDir: "out/preload",
      sourcemap: true,
      lib: {
        entry: "src/preload/index.ts",
        formats: ["cjs"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "index.cjs",
          inlineDynamicImports: true,
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    root: "src/renderer",
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
      },
    },
    build: {
      outDir: resolve(__dirname, "out/renderer"),
      sourcemap: true,
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
