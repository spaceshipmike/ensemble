import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    schemas: "src/schemas.ts",
    config: "src/config.ts",
    operations: "src/operations.ts",
    clients: "src/clients.ts",
    sync: "src/sync.ts",
    skills: "src/skills.ts",
    search: "src/search.ts",
    registry: "src/registry.ts",
    doctor: "src/doctor.ts",
    projects: "src/projects.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
  target: "node20",
  outDir: "dist",
  external: ["better-sqlite3"],
});
