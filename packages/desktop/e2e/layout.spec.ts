import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let page: Page;
let configDir: string;

test.beforeAll(async () => {
  configDir = mkdtempSync(join(tmpdir(), "ensemble-test-"));
  mkdirSync(join(configDir, "ensemble"), { recursive: true });
  writeFileSync(
    join(configDir, "ensemble", "config.json"),
    JSON.stringify({
      servers: [],
      groups: [],
      skills: [],
      plugins: [],
      clients: [],
      marketplaces: [],
      rules: [],
      settings: {},
      profiles: {},
    }),
  );

  app = await electron.launch({
    args: [join(__dirname, "../out/main/index.js")],
    env: {
      ...process.env,
      ENSEMBLE_CONFIG_DIR: join(configDir, "ensemble"),
      NODE_ENV: "test",
    },
  });

  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
});

test("app launches and renders the patch-bay shell", async () => {
  const appRoot = page.locator('[data-testid="app-root"]');
  await expect(appRoot).toBeVisible();
});

test("top chrome shows PATCH / MATRIX / DOCTOR tabs", async () => {
  await expect(page.getByRole("button", { name: "PATCH" })).toBeVisible();
  await expect(page.getByRole("button", { name: "MATRIX" })).toBeVisible();
  await expect(page.getByRole("button", { name: "DOCTOR" })).toBeVisible();
});

test("switching to MATRIX view swaps content", async () => {
  await page.getByRole("button", { name: "MATRIX" }).click();
  // Patch-bay panels should no longer be visible — matrix view is the only child
  await expect(page.getByRole("button", { name: "MATRIX" })).toBeVisible();
});

test("switching to DOCTOR view shows placeholder", async () => {
  await page.getByRole("button", { name: "DOCTOR" }).click();
  await expect(page.getByText(/DOCTOR · SOON/i)).toBeVisible();
});
