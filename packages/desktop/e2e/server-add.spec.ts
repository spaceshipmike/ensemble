import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

let app: ElectronApplication;
let page: Page;
let configDir: string;

test.beforeAll(async () => {
  // Create isolated config with empty servers
  configDir = mkdtempSync(join(tmpdir(), "ensemble-test-add-"));
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
    args: [join(__dirname, "../dist/main/index.js")],
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

test("add server workflow end to end", async () => {
  // Should start with empty state
  await page.locator('[data-testid="sidebar-servers"]').click();

  // Click add server (from empty state or button)
  const addBtn = page.locator("button", { hasText: "Add Server" });
  await addBtn.first().click();

  // Fill form
  const form = page.locator('[data-testid="server-form"]');
  await expect(form).toBeVisible();

  await page.locator('[data-testid="server-name-input"]').fill("my-new-server");
  await page.locator('[data-testid="server-command-input"]').fill("npx -y @test/server");
  await page.locator('[data-testid="server-args-input"]').fill("/tmp/test");

  // Submit
  await page.locator('[data-testid="server-submit-btn"]').click();

  // Should see the new server in the list
  const serverRow = page.locator('[data-testid="server-row-my-new-server"]');
  await expect(serverRow).toBeVisible({ timeout: 5000 });
});

test("server form validates empty name", async () => {
  // Navigate to add form
  await page.locator('[data-testid="add-server-btn"]').click();

  const form = page.locator('[data-testid="server-form"]');
  await expect(form).toBeVisible();

  // Clear name and try to submit
  await page.locator('[data-testid="server-name-input"]').fill("");
  await page.locator('[data-testid="server-submit-btn"]').click();

  // Should show validation error
  const nameError = page.locator('[data-testid="name-error"]');
  await expect(nameError).toBeVisible();
});
