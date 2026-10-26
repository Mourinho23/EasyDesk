const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const NODE_MAJOR_VERSION = 24;
const OUTPUT_DIRECTORY = path.join(__dirname, "..", "build", "node-installer");
const OUTPUT_FILENAME = "Node.js-Setup-x64.msi";

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`Falha ao obter ${url}: HTTP ${response.status}.`);
  }
  return response.text();
}

async function main() {
  const releases = JSON.parse(await fetchText("https://nodejs.org/dist/index.json"));
  const release = releases.find(item =>
    item.lts &&
    item.version.split(".")[0] === `v${NODE_MAJOR_VERSION}` &&
    item.files.includes("win-x64-msi")
  );

  if (!release) {
    throw new Error(`Não foi encontrada uma versão LTS ${NODE_MAJOR_VERSION} com MSI para Windows x64.`);
  }

  const filename = `node-${release.version}-x64.msi`;
  const baseUrl = `https://nodejs.org/dist/${release.version}`;
  const [checksumFile, response] = await Promise.all([
    fetchText(`${baseUrl}/SHASUMS256.txt`),
    fetch(`${baseUrl}/${filename}`, { signal: AbortSignal.timeout(120000) })
  ]);

  if (!response.ok) {
    throw new Error(`Falha ao obter o instalador oficial do Node.js: HTTP ${response.status}.`);
  }

  const expectedChecksum = checksumFile
    .split(/\r?\n/)
    .find(line => line.trim().endsWith(filename))
    ?.trim()
    .split(/\s+/)[0];
  if (!expectedChecksum) {
    throw new Error(`Não foi encontrado o checksum oficial de ${filename}.`);
  }

  const installer = Buffer.from(await response.arrayBuffer());
  const actualChecksum = createHash("sha256").update(installer).digest("hex");
  if (actualChecksum !== expectedChecksum.toLowerCase()) {
    throw new Error(`O checksum SHA-256 de ${filename} não corresponde ao valor oficial.`);
  }

  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIRECTORY, OUTPUT_FILENAME), installer);
  console.log(`Node.js ${release.version} LTS preparado para o instalador Windows.`);
}

main().catch(error => {
  console.error("Não foi possível preparar o instalador opcional do Node.js:", error.message);
  process.exitCode = 1;
});
