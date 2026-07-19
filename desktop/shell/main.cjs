delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, Menu, shell } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const http = require("node:http");

/** Desktop LOOK always uses its own port — never Cursor dev (:3000). */
const PORT = process.env.LOOK_PORT ?? "3010";
const APP_URL = `http://127.0.0.1:${PORT}`;

/** @type {import('node:child_process').ChildProcess | null} */
let nextProcess = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let startedOwnServer = false;

function cleanProcessEnv() {
  const home = process.env.HOME ?? "";
  const env = {
    HOME: home,
    USER: process.env.USER ?? "",
    LOGNAME: process.env.LOGNAME ?? process.env.USER ?? "",
    SHELL: process.env.SHELL ?? "/bin/bash",
    LANG: process.env.LANG ?? "en_US.UTF-8",
    PATH: buildPathEnv(),
    PORT,
    LOOK_PORT: PORT,
    LOOK_DESKTOP: "1",
    // Desktop shell is local-only; keep absolute URLs on the Electron port.
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
  };

  for (const [key, value] of Object.entries(process.env)) {
    if (value == null) continue;
    if (key.startsWith("CURSOR_") || key.startsWith("VSCODE_")) continue;
    if (key === "ELECTRON_RUN_AS_NODE") continue;
    if (key in env) continue;
    env[key] = value;
  }

  return env;
}

function resolveProjectRootFromScript() {
  const resourcesPath = process.resourcesPath;
  const scriptPath = join(resourcesPath, "resolve-project-root.sh");
  const defaultPathFile = join(resourcesPath, "look-project-path.txt");

  if (!existsSync(scriptPath)) {
    return null;
  }

  try {
    return execFileSync(scriptPath, [defaultPathFile], {
      encoding: "utf8",
      env: cleanProcessEnv(),
    }).trim();
  } catch {
    return null;
  }
}

function readResourceFile(name) {
  const packagedPath = join(process.resourcesPath, name);
  if (existsSync(packagedPath)) {
    return readFileSync(packagedPath, "utf8").trim();
  }

  return null;
}

function getProjectRoot() {
  if (process.env.LOOK_PROJECT_ROOT) {
    return process.env.LOOK_PROJECT_ROOT;
  }

  const resolved = resolveProjectRootFromScript();
  if (resolved) {
    process.env.LOOK_PROJECT_ROOT = resolved;
    return resolved;
  }

  const fromResource = readResourceFile("look-project-path.txt");
  if (fromResource) {
    return fromResource;
  }

  return join(app.getAppPath(), "..", "..", "..");
}

function buildPathEnv() {
  const home = process.env.HOME ?? "";
  return [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    `${home}/.nvm/current/bin`,
    `${home}/.volta/bin`,
    "/usr/bin",
    "/bin",
    process.env.PATH ?? "",
  ]
    .filter(Boolean)
    .join(":");
}

function findNpmBinary() {
  const home = process.env.HOME ?? "";
  const candidates = [
    "/opt/homebrew/bin/npm",
    "/usr/local/bin/npm",
    join(home, ".nvm/current/bin/npm"),
    join(home, ".volta/bin/npm"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return "npm";
}

function readDiskBuildId(projectRoot) {
  const buildIdPath = join(projectRoot, ".next", "BUILD_ID");
  if (!existsSync(buildIdPath)) {
    return null;
  }

  return readFileSync(buildIdPath, "utf8").trim();
}

function killProcessOnPort(port) {
  try {
    const pids = execFileSync("lsof", ["-ti", `:${port}`], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        // Process may have already exited.
      }
    }
  } catch {
    // Nothing is listening on the port.
  }
}

function isServerUp() {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** True when the running server serves the current on-disk production build. */
function serverServesCurrentBuild(projectRoot) {
  const buildId = readDiskBuildId(projectRoot);
  if (!buildId) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const req = http.get(
      `${APP_URL}/_next/static/${buildId}/_buildManifest.js`,
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForServer(maxAttempts = 120) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = async () => {
      if (await isServerUp()) {
        resolve();
        return;
      }

      attempts += 1;
      if (attempts >= maxAttempts) {
        reject(new Error("LOOK server did not start in time"));
        return;
      }

      setTimeout(check, 500);
    };

    void check();
  });
}

function startNextServer(projectRoot) {
  const npm = findNpmBinary();
  const env = cleanProcessEnv();
  const command = `cd ${JSON.stringify(projectRoot)} && ${JSON.stringify(npm)} run start`;

  nextProcess = spawn("/bin/bash", ["-lc", command], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  startedOwnServer = true;

  nextProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(`[look-server] ${chunk}`);
  });

  nextProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(`[look-server] ${chunk}`);
  });

  nextProcess.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`LOOK server exited with code ${code}`);
    }
    nextProcess = null;
    startedOwnServer = false;
  });
}

async function ensureServerRunning() {
  const projectRoot = getProjectRoot();
  if (!existsSync(join(projectRoot, "package.json"))) {
    const { dialog } = require("electron");
    dialog.showErrorBox(
      "LOOK",
      "Не найдена папка проекта LOOK.\n\nОжидается репозиторий в ~/Documents/LOOK или рядом."
    );
    throw new Error(`LOOK project not found at ${projectRoot}`);
  }

  if (!readDiskBuildId(projectRoot)) {
    const { dialog } = require("electron");
    dialog.showErrorBox(
      "LOOK",
      "Не найден production-сборка (.next/BUILD_ID).\n\nВыполните в каталоге проекта:\nnpm run build"
    );
    throw new Error("LOOK production build missing");
  }

  if ((await isServerUp()) && (await serverServesCurrentBuild(projectRoot))) {
    return;
  }

  // Reuse a stale `next start` after `npm run build` makes client chunks return HTTP 400.
  killProcessOnPort(PORT);
  await new Promise((resolve) => setTimeout(resolve, 500));

  startNextServer(projectRoot);
  await waitForServer();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "LOOK",
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void mainWindow.loadURL(APP_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function stopNextServer() {
  if (!startedOwnServer || !nextProcess || nextProcess.killed) return;

  nextProcess.kill("SIGTERM");

  setTimeout(() => {
    if (nextProcess && !nextProcess.killed) {
      nextProcess.kill("SIGKILL");
    }
  }, 3000);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  try {
    await ensureServerRunning();
    createWindow();
  } catch (error) {
    console.error(error);
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void ensureServerRunning().then(createWindow);
  }
});

app.on("before-quit", () => {
  stopNextServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
