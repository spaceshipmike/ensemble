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
  // Create isolated config directory
  configDir = mkdtempSync(join(tmpdir(), "ensemble-test-"));
  mkdirSync(join(configDir, "ensemble"), { recursive: true });
  writeFileSync(
    join(configDir, "ensemble", "config.json"),
    JSON.stringify({
      servers: [
        {
          name: "test-server",
          command: "echo",
          args: ["hello"],
          env: {},
          transport: "stdio",
          enabled: true,
          origin: { source: "manual", trust_tier: "local", timestamp: new Date().toISOString() },
        },
        {
          name: "disabled-server",
          command: "echo",
          args: ["disabled"],
          env: {},
          transport: "stdio",
          enabled: false,
          origin: { source: "manual", trust_tier: "local", timestamp: new Date().toISOString() },
        },
      ],
      groups: [
        {
          name: "dev-tools",
          description: "Development tools",
          servers: ["test-server"],
          skills: [],
          plugins: [],
        },
      ],
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

test("app launches with sidebar and detail panel", async () => {
  const appRoot = page.locator('[data-testid="app-root"]');
  await expect(appRoot).toBeVisible();

  const sidebar = page.locator('[data-testid="sidebar"]');
  await expect(sidebar).toBeVisible();

  const detailPanel = page.locator('[data-testid="detail-panel"]');
  await expect(detailPanel).toBeVisible();
});

test("sidebar shows all ten section labels", async () => {
  const sections = [
    "servers", "skills", "plugins", "groups", "clients",
    "sync", "doctor", "registry", "profiles", "rules",
  ];

  for (const section of sections) {
    const btn = page.locator(`[data-testid="sidebar-${section}"]`);
    await expect(btn).toBeVisible();
  }
});

test("clicking sidebar sections switches content", async () => {
  // Navigate to groups
  await page.locator('[data-testid="sidebar-groups"]').click();
  const groupsPage = page.locator('[data-testid="groups-page"]');
  await expect(groupsPage).toBeVisible();

  // Navigate to doctor
  await page.locator('[data-testid="sidebar-doctor"]').click();
  const doctorPage = page.locator('[data-testid="doctor-page"]');
  await expect(doctorPage).toBeVisible();

  // Navigate back to servers
  await page.locator('[data-testid="sidebar-servers"]').click();
  const serversPage = page.locator('[data-testid="servers-page"]');
  await expect(serversPage).toBeVisible();
});

test("servers page shows loaded servers from config", async () => {
  await page.locator('[data-testid="sidebar-servers"]').click();

  const testServer = page.locator('[data-testid="server-row-test-server"]');
  await expect(testServer).toBeVisible();

  const disabledServer = page.locator('[data-testid="server-row-disabled-server"]');
  await expect(disabledServer).toBeVisible();
});
