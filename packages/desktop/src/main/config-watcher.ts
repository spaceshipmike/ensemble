import { watch, type FSWatcher } from "node:fs";
import { BrowserWindow } from "electron";
import { CONFIG_PATH } from "ensemble";

let watcher: FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 250;

/** Start watching the Ensemble config file for external changes */
export function startConfigWatcher(): void {
  if (watcher) return;

  try {
    watcher = watch(CONFIG_PATH, (eventType) => {
      if (eventType !== "change") return;

      // Debounce rapid writes (e.g., atomic write creates temp then renames)
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          win.webContents.send("config:external-change");
        }
      }, DEBOUNCE_MS);
    });
  } catch {
    // Config file may not exist yet — that's fine
  }
}

/** Stop watching */
export function stopConfigWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
