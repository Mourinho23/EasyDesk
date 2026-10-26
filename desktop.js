const { app, BrowserWindow, shell } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
let mainWindow;
let server;
let sensorServiceManaged = false;
let stoppingSensorService = false;

function getSensorServicePath() {
  return path.join(process.resourcesPath, "sensor-service.enabled");
}

async function startSensorService() {
  if (process.platform !== "win32" || !fs.existsSync(getSensorServicePath())) return;

  process.env.EASYDESK_SENSOR_SERVICE_ENABLED = "1";
  sensorServiceManaged = true;
  const serviceControl = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "sc.exe");
  try {
    await execFileAsync(serviceControl, ["start", "EasyDeskSensorService"], {
      timeout: 15000,
      windowsHide: true
    });
  } catch (error) {
    if (error.code !== 1056) {
      console.error("Não foi possível iniciar o serviço de sensores:", error.message);
    }
  }
}

async function stopSensorService() {
  const serviceControl = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "sc.exe");
  try {
    await execFileAsync(serviceControl, ["stop", "EasyDeskSensorService"], {
      timeout: 10000,
      windowsHide: true
    });
  } catch (error) {
    if (error.code !== 1062) {
      console.error("Não foi possível parar o serviço de sensores:", error.message);
    }
  }
}

function aguardarServidor() {
  return new Promise((resolve, reject) => {
    if (server.listening) {
      resolve();
      return;
    }

    server.once("listening", resolve);
    server.once("error", reject);
  });
}

async function criarJanela() {
  await aguardarServidor();

  const endereco = server.address();
  const url = `http://${endereco.address}:${endereco.port}`;
  const dashboardOrigin = new URL(url).origin;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: path.join(
      __dirname,
      process.platform === "win32" ? "Interface/easydesk.ico" : "Interface/easydesk-icon.png"
    ),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url: destino }) => {
    if (new URL(destino).origin !== dashboardOrigin) {
      shell.openExternal(destino);
      return { action: "deny" };
    }

    return { action: "allow" };
  });
  mainWindow.webContents.on("will-navigate", (event, destino) => {
    if (new URL(destino).origin !== dashboardOrigin) {
      event.preventDefault();
      shell.openExternal(destino);
    }
  });

  await mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  await startSensorService();
  server = require("./server");
  await criarJanela();
}).catch(erro => {
  console.error("Não foi possível iniciar o EasyDesk:", erro);
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    criarJanela().catch(erro => {
      console.error("Não foi possível abrir a janela do EasyDesk:", erro);
      app.quit();
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", event => {
  if (sensorServiceManaged) {
    event.preventDefault();
    if (stoppingSensorService) return;

    stoppingSensorService = true;
    stopSensorService().finally(() => {
      sensorServiceManaged = false;
      app.quit();
    });
    return;
  }

  if (server?.listening) {
    server.close();
    server.closeAllConnections();
  }
});
