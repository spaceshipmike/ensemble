import { join } from "node:path";
import { is } from "@electron-toolkit/utils";
import { BrowserWindow, app, session, shell } from "electron";
import log from "electron-log";
import { createIPCHandler } from "electron-trpc/main";
import { initAutoUpdater } from "./auto-update";
import { startConfigWatcher, stopConfigWatcher } from "./config-watcher";
import { appRouter } from "./ipc/router";

// Enforce sandbox on all renderers.
app.enableSandbox();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#f5f4f0",
    show: !is.dev ? false : true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      // nodeIntegration: false and contextIsolation: true are defaults.
    },
  });

  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    log.error("Renderer gone:", details);
  });
  mainWindow.webContents.on("preload-error", (_e, preloadPath, err) => {
    log.error("Preload error at", preloadPath, err);
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    log.error("did-fail-load:", code, desc, url);
  });

  // --- Security guards ---

  // CSP is strict in production. In dev, Vite HMR needs inline/eval scripts
  // and a websocket connection to the dev server, so we leave CSP off and
  // rely on the rest of the sandbox guards (sandbox, contextIsolation, etc.).
  if (!is.dev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
          ],
        },
      });
    });
  }

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) {
      event.preventDefault();
      log.warn("Blocked navigation to:", url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // --- IPC ---

  createIPCHandler({ router: appRouter, windows: [mainWindow] });

  // --- Window lifecycle ---

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  startConfigWatcher();
  createWindow();

  if (!is.dev) {
    initAutoUpdater("latest");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopConfigWatcher();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  log.info("App quitting");
});
