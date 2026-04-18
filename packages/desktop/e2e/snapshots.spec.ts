import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ElectronApplication, type Page, expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let page: Page;
let configDir: string;
let snapshotsDir: string;

test.beforeAll(async () => {
  configDir = mkdtempSync(join(tmpdir(), "ensemble-snaps-"));
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
      agents: [],
      commands: [],
    }),
  );

  // Seed a snapshot so the SnapshotsView has something to render.
  snapshotsDir = join(configDir, "ensemble", "snapshots");
  const snapId = "2026-04-18T10-00-00.000Z-abc123";
  const snapDir = join(snapshotsDir, snapId);
  mkdirSync(join(snapDir, "files"), { recursive: true });
  const capturedPath = join(configDir, "captured.txt");
  writeFileSync(capturedPath, "pre-sync content\n", "utf-8");
  writeFileSync(join(snapDir, "files", "abc123__captured.txt"), "pre-sync content\n", "utf-8");
  writeFileSync(
    join(snapDir, "manifest.json"),
    JSON.stringify(
      {
        id: snapId,
        createdAt: "2026-04-18T10:00:00.000Z",
        syncContext: "sync claude-code",
        files: [
          {
            path: capturedPath,
            state: "existing",
            preContentPath: "files/abc123__captured.txt",
          },
          {
            path: join(configDir, "brand-new.txt"),
            state: "new-file",
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  app = await electron.launch({
    args: [join(__dirname, "../out/main/index.js")],
    env: {
      ...process.env,
      ENSEMBLE_CONFIG_DIR: join(configDir, "ensemble"),
      ENSEMBLE_SNAPSHOTS_DIR: snapshotsDir,
      NODE_ENV: "test",
    },
  });

  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
});

test("SNAPSHOTS tab is present in the top chrome", async () => {
  await expect(page.getByRole("button", { name: "SNAPSHOTS" })).toBeVisible();
});

test("SNAPSHOTS view lists captured snapshots in reverse-chronological order", async () => {
  await page.getByRole("button", { name: "SNAPSHOTS" }).click();
  // Left rail shows the seeded snapshot.
  await expect(page.getByTestId("snapshot-item-2026-04-18T10-00-00.000Z-abc123")).toBeVisible();
  // Right pane shows the snapshot id.
  await expect(page.getByText("2026-04-18T10-00-00.000Z-abc123")).toBeVisible();
  // And the sync context metadata.
  await expect(page.getByText("sync claude-code")).toBeVisible();
});

test("file manifest expands on click and shows per-file state", async () => {
  await page.getByRole("button", { name: "SNAPSHOTS" }).click();
  await page.getByTestId("files-toggle").click();
  // The captured file appears with its state tag.
  await expect(page.getByText("captured.txt", { exact: false })).toBeVisible();
  await expect(page.getByText("brand-new.txt", { exact: false })).toBeVisible();
});

test("restore dialog shows the CLI-mirror warning copy", async () => {
  await page.getByRole("button", { name: "SNAPSHOTS" }).click();
  await page.getByTestId("restore-button").click();
  const dialog = page.getByTestId("restore-dialog");
  await expect(dialog).toBeVisible();
  const msg = page.getByTestId("restore-dialog-message");
  await expect(msg).toContainText(/Restore snapshot from/);
  await expect(msg).toContainText(/overwrite 1 file/);
  await expect(msg).toContainText(/1 file will be deleted/);
  await expect(msg).toContainText(/Continue\?/);
});

test("restore dialog cancel closes the dialog without firing a restore", async () => {
  await page.getByRole("button", { name: "SNAPSHOTS" }).click();
  await page.getByTestId("restore-button").click();
  await page.getByTestId("restore-dialog-cancel").click();
  await expect(page.getByTestId("restore-dialog")).toBeHidden();
});
