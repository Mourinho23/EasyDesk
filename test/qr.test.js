const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { mkdtempSync } = require("node:fs");
const { once } = require("node:events");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const si = require("systeminformation");

process.env.PORT = "0";
const cacheDirectory = mkdtempSync(path.join(os.tmpdir(), "easydesk-test-"));
process.env.EASYDESK_DATA_DIR = cacheDirectory;
os.networkInterfaces = () => ({});
si.networkInterfaceDefault = async () => null;

const server = require("../app/server");

test("QR respects a custom public URL when configured", async () => {
  if (!server.listening) await once(server, "listening");

  const priorUrl = process.env.EASYDESK_QR_URL;
  process.env.EASYDESK_QR_URL = "https://miudo.example.com";

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/qr`);
  const qr = await response.json();

  if (priorUrl === undefined) {
    delete process.env.EASYDESK_QR_URL;
  } else {
    process.env.EASYDESK_QR_URL = priorUrl;
  }

  assert.equal(response.status, 200);
  assert.equal(qr.url, "https://miudo.example.com/#principal");
  assert.match(qr.dataUrl, /^data:image\/png;base64,/);
});

test("info shares and persists the latest snapshot", async () => {
  if (!server.listening) await once(server, "listening");

  const { port } = server.address();
  const responses = await Promise.all([
    fetch(`http://127.0.0.1:${port}/api/info`),
    fetch(`http://127.0.0.1:${port}/api/info`)
  ]);
  const snapshots = await Promise.all(responses.map(response => response.json()));
  const savedSnapshot = JSON.parse(
    await fs.readFile(path.join(cacheDirectory, "last-update.json"), "utf8")
  );

  assert.ok(responses.every(response => response.status === 200));
  assert.equal(snapshots[0].momento, snapshots[1].momento);
  assert.equal(savedSnapshot.momento, snapshots[0].momento);
});

test("QR is generated without internet or a network interface", async t => {
  if (!server.listening) await once(server, "listening");

  t.after(async () => {
    if (server.lanServer?.listening) {
      await new Promise(resolve => server.lanServer.close(resolve));
    }
    if (server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
    await fs.rm(cacheDirectory, { recursive: true, force: true });
  });

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/qr`);
  const qr = await response.json();
  const hostname = os.hostname().replace(/\.local$/i, "");

  assert.equal(response.status, 200);
  assert.equal(qr.url, `http://${hostname}.local:${port}/#principal`);
  assert.match(qr.dataUrl, /^data:image\/png;base64,/);
});