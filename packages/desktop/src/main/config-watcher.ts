import { EventEmitter } from "node:events";
import { type FSWatcher, watch } from "node:fs";
import { CONFIG_PATH } from "ensemble";

let watcher: FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 250;

/**
 * Fires "change" whenever the Ensemble config file is written to from outside
 * the desktop app (e.g. by the CLI). Debounced to collapse atomic
 * write-then-rename sequences into a single event.
 */
export const configEvents = new EventEmitter();

/** Start watching the Ensemble config file for external changes. */
export function startConfigWatcher(): void {
  if (watcher) return;

  try {
    watcher = watch(CONFIG_PATH, (eventType) => {
      if (eventType !== "change") return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        configEvents.emit("change");
      }, DEBOUNCE_MS);
    });
  } catch {
    // Config file may not exist yet — that's fine.
  }
}

/** Stop watching. */
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
