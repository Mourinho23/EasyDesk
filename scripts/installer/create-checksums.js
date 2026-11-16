const { createReadStream } = require("node:fs");
const { readdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");

const RELEASE_DIRECTORY = path.join(__dirname, "..", "..", "release");
const installersByPlatform = {
  windows: filename => /^EasyDesk-Setup-.*\.exe$/i.test(filename),
  mac: filename => /\.dmg$/i.test(filename),
  linux: filename => /\.(AppImage|deb|rpm)$/i.test(filename)
};

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function createChecksums(platform) {
  const matchesInstaller = installersByPlatform[platform];
  if (!matchesInstaller) {
    throw new Error(`Plataforma inválida para criar checksums: ${platform || "(em falta)"}.`);
  }

  const entries = await readdir(RELEASE_DIRECTORY, { withFileTypes: true });
  const installers = entries.filter(entry => entry.isFile() && matchesInstaller(entry.name));
  if (!installers.length) {
    throw new Error(`Não foram encontrados instaladores para a plataforma ${platform}.`);
  }

  for (const installer of installers) {
    const installerPath = path.join(RELEASE_DIRECTORY, installer.name);
    const checksum = await sha256(installerPath);
    await writeFile(`${installerPath}.sha256`, `${checksum}  ${installer.name}\n`, "utf8");
    console.log(`SHA-256 ${installer.name}: ${checksum}`);
  }
}

createChecksums(process.argv[2]).catch(error => {
  console.error("Não foi possível criar os checksums dos instaladores:", error);
  process.exitCode = 1;
});
