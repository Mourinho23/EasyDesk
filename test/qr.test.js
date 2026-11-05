const assert = require("node:assert/strict");
const { once } = require("node:events");
const os = require("node:os");
const test = require("node:test");
const si = require("systeminformation");

process.env.PORT = "0";
os.networkInterfaces = () => ({});
si.networkInterfaceDefault = async () => null;

const server = require("../server");

test("QR is generated without internet or a network interface", async t => {
  if (!server.listening) await once(server, "listening");

  t.after(async () => {
    if (server.lanServer?.listening) {
      await new Promise(resolve => server.lanServer.close(resolve));
    }
    if (server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/qr`);
  const qr = await response.json();
  const hostname = os.hostname().replace(/\.local$/i, "");

  assert.equal(response.status, 200);
  assert.equal(qr.url, `http://${hostname}.local:${port}/#principal`);
  assert.match(qr.dataUrl, /^data:image\/png;base64,/);
});