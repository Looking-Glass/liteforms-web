import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { registerNativeBridgeIpc } from "./nativeBridge";
import { createNextServerEnv, getAvailablePort, resolveStandaloneDir, waitForHttpServer } from "./nextServer";

let mainWindow: BrowserWindow | null = null;
let nextServerProcess: ChildProcess | null = null;
let appUrl: string | null = null;
const nativeBridgeService = registerNativeBridgeIpc(ipcMain);

async function resolveAppUrl() {
  const devServerUrl = process.env.LITEFORMS_ELECTRON_DEV_SERVER_URL;
  if (devServerUrl) {
    return devServerUrl;
  }

  return await startPackagedNextServer();
}

async function startPackagedNextServer() {
  const standaloneDir = resolveStandaloneDir({
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath
  });
  const serverPath = join(standaloneDir, "server.js");

  if (!existsSync(serverPath)) {
    throw new Error(
      `Missing packaged Next standalone server at ${serverPath}. Run npm run build:electron before launching Electron.`
    );
  }

  const port = await getAvailablePort();
  const url = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, [serverPath], {
    cwd: standaloneDir,
    env: createNextServerEnv({ port }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  nextServerProcess = child;

  child.stdout?.on("data", (chunk) => {
    console.log(`[next] ${chunk.toString().trim()}`);
  });
  child.stderr?.on("data", (chunk) => {
    console.error(`[next] ${chunk.toString().trim()}`);
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`Packaged Next server exited with code ${code ?? "null"} and signal ${signal ?? "null"}.`);
    }
  });

  await waitForHttpServer(url);
  return url;
}

function createWindow(url: string) {
  const allowedOrigin = new URL(url).origin;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: true,
    title: "Liteforms",
    backgroundColor: "#080808",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.js"),
      sandbox: true,
      webSecurity: true,
      webviewTag: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isExternalUrl(targetUrl, allowedOrigin)) {
      void shell.openExternal(targetUrl);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isExternalUrl(targetUrl, allowedOrigin)) {
      return;
    }
    event.preventDefault();
    void shell.openExternal(targetUrl);
  });

  void mainWindow.loadURL(url);
}

function isExternalUrl(targetUrl: string, allowedOrigin: string) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.origin === allowedOrigin) {
      return false;
    }
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function stopNextServer() {
  if (nextServerProcess && !nextServerProcess.killed) {
    nextServerProcess.kill();
  }
  nextServerProcess = null;
}

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("org.liteforms.web");
  }

  appUrl = await resolveAppUrl();
  createWindow(appUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && appUrl) {
      createWindow(appUrl);
    }
  });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("before-quit", () => {
  stopNextServer();
  nativeBridgeService.dispose();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
