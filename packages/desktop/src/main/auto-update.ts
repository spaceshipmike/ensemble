import log from "electron-log";
import { autoUpdater } from "electron-updater";

autoUpdater.logger = log;

export function initAutoUpdater(channel: "latest" | "beta" = "latest"): void {
  autoUpdater.channel = channel;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    log.info("Update available:", info.version);
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Update downloaded:", info.version, "— will install on quit");
  });

  autoUpdater.on("error", (err) => {
    log.error("Auto-update error:", err.message);
  });

  // Check on launch, then every 4 hours.
  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);
}

export function setUpdateChannel(channel: "latest" | "beta"): void {
  autoUpdater.channel = channel;
  autoUpdater.checkForUpdatesAndNotify();
}
