const { app, BrowserWindow, shell } = require("electron");
const server = require("./server");

let mainWindow;

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

app.whenReady().then(criarJanela).catch(erro => {
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

app.on("before-quit", () => {
  if (server.listening) {
    server.close();
    server.closeAllConnections();
  }
});
