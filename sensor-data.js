const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const WINDOWS_SENSOR_URL = "http://127.0.0.1:47621/sensors";
const SENSOR_CACHE_MS = 1000;

let cachedReadings;
let cachedUntil = 0;
let pendingRead;
let previousRaplReadings = null;

function emptyReadings(status, error = null) {
  return {
    status,
    error,
    temperatureCelsius: {
      cpu: null,
      gpu: null,
      disk: null
    },
    power: {
      cpuWatts: null,
      gpuWatts: null,
      systemWatts: null,
      powerSupplyEfficiencyPercent: null
    }
  };
}

async function readOptionalNumber(filePath) {
  try {
    const value = Number((await fs.readFile(filePath, "utf8")).trim());
    return Number.isFinite(value) ? value : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readOptionalText(filePath) {
  try {
    return (await fs.readFile(filePath, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readLinuxTemperatures() {
  const root = "/sys/class/hwmon";
  let directories;
  try {
    directories = await fs.readdir(root);
  } catch (error) {
    if (error.code === "ENOENT") return { cpu: null, gpu: null, disk: null };
    throw error;
  }

  const readings = [];
  for (const directory of directories) {
    const hardwarePath = path.join(root, directory);
    const hardwareName = await readOptionalText(path.join(hardwarePath, "name")) || "";
    const files = await fs.readdir(hardwarePath);
    const temperatureFiles = files.filter(file => /^temp\d+_input$/.test(file));

    for (const file of temperatureFiles) {
      const value = await readOptionalNumber(path.join(hardwarePath, file));
      if (value === null) continue;

      const label = await readOptionalText(
        path.join(hardwarePath, file.replace("_input", "_label"))
      ) || "";
      readings.push({
        component: `${hardwareName} ${label}`,
        value: value > 1000 ? value / 1000 : value
      });
    }
  }

  const highestMatching = pattern => {
    const values = readings
      .filter(reading => pattern.test(reading.component))
      .map(reading => reading.value);
    return values.length ? Math.max(...values) : null;
  };

  return {
    cpu: highestMatching(/cpu|coretemp|k10temp|zenpower|tctl|tccd|package/i),
    gpu: highestMatching(/gpu|amdgpu|nouveau|i915|xe/i),
    disk: highestMatching(/nvme|drivetemp|storage|ssd|sata/i)
  };
}

async function readLinuxCpuPower() {
  const root = "/sys/class/powercap";
  let directories;
  try {
    directories = await fs.readdir(root);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const current = [];
  for (const directory of directories.filter(name => /^(?:intel|amd)-rapl:\d+$/i.test(name))) {
    const powercapPath = path.join(root, directory);
    const [energy, maximum] = await Promise.all([
      readOptionalNumber(path.join(powercapPath, "energy_uj")),
      readOptionalNumber(path.join(powercapPath, "max_energy_range_uj"))
    ]);
    if (energy !== null) current.push({ directory, energy, maximum });
  }

  if (!current.length) {
    previousRaplReadings = null;
    return null;
  }

  const now = Date.now();
  const previous = previousRaplReadings;
  previousRaplReadings = { now, readings: current };
  if (!previous || previous.readings.length !== current.length) return null;

  const elapsedSeconds = (now - previous.now) / 1000;
  if (elapsedSeconds <= 0) return null;

  const previousByDirectory = new Map(previous.readings.map(reading => [reading.directory, reading]));
  let deltaMicrojoules = 0;
  for (const reading of current) {
    const old = previousByDirectory.get(reading.directory);
    if (!old) return null;
    let delta = reading.energy - old.energy;
    if (delta < 0 && reading.maximum !== null) {
      delta += reading.maximum;
    }
    if (delta < 0) return null;
    deltaMicrojoules += delta;
  }

  return deltaMicrojoules / 1_000_000 / elapsedSeconds;
}

async function readLinuxGpuPower() {
  const root = "/sys/class/hwmon";
  let directories;
  try {
    directories = await fs.readdir(root);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const readings = [];
  for (const directory of directories) {
    const hardwarePath = path.join(root, directory);
    const hardwareName = await readOptionalText(path.join(hardwarePath, "name")) || "";
    if (!/gpu|amdgpu|nouveau|i915|xe/i.test(hardwareName)) continue;

    const files = await fs.readdir(hardwarePath);
    const powerFiles = files
      .filter(file => /^power\d+_(?:average|input)$/.test(file))
      .sort((left, right) => Number(/_average$/.test(right)) - Number(/_average$/.test(left)));
    for (const file of powerFiles) {
      const value = await readOptionalNumber(path.join(hardwarePath, file));
      if (value !== null) readings.push(value / 1_000_000);
    }
  }

  return readings.length ? Math.max(...readings) : null;
}

async function readLinuxSensors() {
  const [temperatureCelsius, cpuWatts, gpuWatts] = await Promise.all([
    readLinuxTemperatures(),
    readLinuxCpuPower(),
    readLinuxGpuPower()
  ]);
  const hasTemperature = Object.values(temperatureCelsius).some(Number.isFinite);
  const hasPower = Number.isFinite(cpuWatts) || Number.isFinite(gpuWatts);
  const result = emptyReadings(hasTemperature || hasPower ? "available" : "not-exposed");
  result.temperatureCelsius = temperatureCelsius;
  result.power.cpuWatts = cpuWatts;
  result.power.gpuWatts = gpuWatts;
  return result;
}

function wattsFromPowermetrics(output, expression) {
  const match = output.match(expression);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value)
    ? value * (match[2].toLowerCase() === "mw" ? 0.001 : 1)
    : null;
}

async function readMacSensors() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    return emptyReadings("requires-admin");
  }

  const { stdout } = await execFileAsync(
    "/usr/bin/powermetrics",
    ["--samplers", "cpu_power", "-n", "1", "-i", "1000"],
    { timeout: 5000, windowsHide: true }
  );
  const result = emptyReadings("available");
  result.power.cpuWatts = wattsFromPowermetrics(stdout, /^\s*CPU Power\s*:\s*([\d.]+)\s*(mW|W)\s*$/im);
  result.power.gpuWatts = wattsFromPowermetrics(stdout, /^\s*GPU Power\s*:\s*([\d.]+)\s*(mW|W)\s*$/im);
  result.power.systemWatts = wattsFromPowermetrics(stdout, /^\s*Combined Power\b.*:\s*([\d.]+)\s*(mW|W)\s*$/im);
  if (!Object.values(result.power).some(Number.isFinite)) {
    result.status = "not-exposed";
  }
  return result;
}

async function getWindowsSensorResponse() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(WINDOWS_SENSOR_URL, { signal: controller.signal });
    const readings = await response.json();
    if (!response.ok) {
      throw new Error(readings.error || `O serviço de sensores respondeu com o estado ${response.status}.`);
    }
    return readings;
  } finally {
    clearTimeout(timeout);
  }
}

async function startWindowsSensorService() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const serviceControl = path.join(systemRoot, "System32", "sc.exe");
  try {
    await execFileAsync(serviceControl, ["start", "EasyDeskSensorService"], {
      timeout: 10000,
      windowsHide: true
    });
  } catch (error) {
    if (error.code !== 1056) throw error;
  }
}

async function readWindowsSensors() {
  if (process.env.EASYDESK_SENSOR_SERVICE_ENABLED !== "1") {
    return emptyReadings("not-installed");
  }

  try {
    const readings = await getWindowsSensorResponse();
    return normalizeWindowsReadings(readings);
  } catch {
    await startWindowsSensorService();
    let lastError;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      try {
        const readings = await getWindowsSensorResponse();
        return normalizeWindowsReadings(readings);
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`Não foi possível ligar ao serviço de sensores do Windows: ${lastError.message}`);
  }
}

function normalizeWindowsReadings(readings) {
  return {
    status: "available",
    error: null,
    temperatureCelsius: {
      cpu: readings.cpuTemperatureCelsius ?? null,
      gpu: readings.gpuTemperatureCelsius ?? null,
      disk: readings.diskTemperatureCelsius ?? null
    },
    power: {
      cpuWatts: readings.cpuPowerWatts ?? null,
      gpuWatts: readings.gpuPowerWatts ?? null,
      systemWatts: readings.systemPowerWatts ?? null,
      powerSupplyEfficiencyPercent: readings.powerSupplyEfficiencyPercent ?? null
    }
  };
}

async function readPlatformSensors() {
  if (process.platform === "win32") return readWindowsSensors();
  if (process.platform === "darwin") return readMacSensors();
  if (process.platform === "linux") return readLinuxSensors();
  return emptyReadings("unsupported");
}

async function readSensorData() {
  if (cachedReadings && Date.now() < cachedUntil) return cachedReadings;
  if (pendingRead) return pendingRead;

  pendingRead = readPlatformSensors()
    .then(readings => {
      cachedReadings = readings;
      cachedUntil = Date.now() + SENSOR_CACHE_MS;
      return readings;
    })
    .finally(() => {
      pendingRead = null;
    });
  return pendingRead;
}

module.exports = { readSensorData };
