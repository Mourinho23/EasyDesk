const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { readSensorData } = require("../sensor-data");

test("application JavaScript parses", () => {
  for (const file of ["server.js", "desktop.js", "sensor-data.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.doesNotThrow(() => new vm.Script(source, { filename: file }));
  }
});

test("sensor readings use a consistent shape on every platform", async () => {
  const previousSetting = process.env.EASYDESK_SENSOR_SERVICE_ENABLED;
  delete process.env.EASYDESK_SENSOR_SERVICE_ENABLED;

  try {
    const readings = await readSensorData();

    assert.equal(typeof readings.status, "string");
    assert.deepEqual(Object.keys(readings.temperatureCelsius), ["cpu", "gpu", "disk"]);
    assert.deepEqual(Object.keys(readings.power), [
      "cpuWatts",
      "gpuWatts",
      "systemWatts",
      "powerSupplyEfficiencyPercent"
    ]);
    for (const value of Object.values(readings.temperatureCelsius)) {
      assert.ok(value === null || Number.isFinite(value));
    }
    for (const value of Object.values(readings.power)) {
      assert.ok(value === null || Number.isFinite(value));
    }
  } finally {
    if (previousSetting === undefined) {
      delete process.env.EASYDESK_SENSOR_SERVICE_ENABLED;
    } else {
      process.env.EASYDESK_SENSOR_SERVICE_ENABLED = previousSetting;
    }
  }
});
