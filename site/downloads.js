const releaseRepository = window.EASYDESK_RELEASE_REPOSITORY;
const releaseStatus = document.getElementById("release-status");
const linuxFormat = document.getElementById("linux-format");
const macArchitecture = document.getElementById("mac-arch");
const downloadButtons = [...document.querySelectorAll("[data-download]")];
const releaseAssets = new Map();

document.getElementById("year").textContent = String(new Date().getFullYear());

function defineDownload(button, asset, label, metadata) {
  if (!asset) {
    button.href = "#downloads";
    button.setAttribute("aria-disabled", "true");
    button.removeAttribute("download");
    document.querySelector(`[data-meta="${button.dataset.download}"]`).textContent =
      "Ainda não publicado";
    return false;
  }

  button.href = asset.browser_download_url;
  button.removeAttribute("aria-disabled");
  document.querySelector(`[data-meta="${button.dataset.download}"]`).textContent = metadata;
  button.querySelector("span").textContent = "↓";
  button.setAttribute("aria-label", `Transferir ${label}`);
  return true;
}

function updateLinuxDownload() {
  const format = linuxFormat.value;
  const asset = releaseAssets.get(`linux:${format}`);
  const labels = {
    AppImage: "EasyDesk AppImage para Linux",
    deb: "EasyDesk .deb para Linux",
    rpm: "EasyDesk .rpm para Linux"
  };
  const metadata = {
    AppImage: "AppImage · x64",
    deb: "Pacote Debian · x64",
    rpm: "Pacote RPM · x64"
  };

  const ready = defineDownload(
    document.querySelector('[data-download="linux"]'),
    asset,
    labels[format],
    metadata[format]
  );
  document.querySelector('[data-download="linux"]').firstChild.textContent =
    `Transferir ${format === "AppImage" ? "AppImage" : `.${format}`} `;
  if (!ready && releaseAssets.size) {
    document.querySelector('[data-meta="linux"]').textContent =
      `Formato ${format} ainda não publicado`;
  }
}

function updateMacDownload() {
  const architecture = macArchitecture.value;
  const button = document.querySelector('[data-download="mac"]');
  if (!architecture) {
    button.href = "#downloads";
    button.setAttribute("aria-disabled", "true");
    document.querySelector('[data-meta="mac"]').textContent =
      "Escolhe o processador do Mac";
    return;
  }

  const asset = releaseAssets.get(`mac:${architecture}`);
  const processor = architecture === "arm64" ? "Apple Silicon" : "Intel";
  const ready = defineDownload(
    button,
    asset,
    `EasyDesk para macOS (${processor})`,
    `DMG · ${processor}`
  );
  if (!ready && releaseAssets.size) {
    document.querySelector('[data-meta="mac"]').textContent =
      `Versão para ${processor} ainda não publicada`;
  }
}

function detectPlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  if (/win/i.test(platform)) return "windows";
  if (/mac/i.test(platform)) return "mac";
  if (/linux/i.test(platform)) return "linux";
  return null;
}

function selectPlatform(platform) {
  if (!platform) return;
  const card = document.querySelector(`[data-platform="${platform}"]`);
  card?.classList.add("recommended-platform");
}

async function loadLatestRelease() {
  selectPlatform(detectPlatform());
  if (!/^[\w.-]+\/[\w.-]+$/.test(releaseRepository || "")) {
    releaseStatus.textContent =
      "Os downloads ficam disponíveis depois de configurar o repositório do projeto e publicar uma versão.";
    downloadButtons.forEach(button => {
      button.href = "#downloads";
      button.setAttribute("aria-disabled", "true");
    });
    document.querySelectorAll(".download-meta").forEach(element => {
      element.textContent = "Ainda não publicado";
    });
    return;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${releaseRepository}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (response.status === 404) {
      releaseStatus.textContent =
        "Ainda não há instaladores publicados. Publica uma versão para disponibilizar os downloads.";
      document.querySelectorAll(".download-meta").forEach(element => {
        element.textContent = "Ainda não publicado";
      });
      return;
    }
    if (!response.ok) {
      throw new Error(`O serviço de versões respondeu com o estado ${response.status}.`);
    }

    const release = await response.json();
    const assets = release.assets || [];
    const findAsset = pattern => assets.find(asset => pattern.test(asset.name));
    const windows = findAsset(/^EasyDesk-Setup-.*\.exe$/i);

    if (windows) {
      releaseAssets.set("windows", windows);
      defineDownload(
        document.querySelector('[data-download="windows"]'),
        windows,
        "EasyDesk para Windows",
        "Instalador NSIS · x64"
      );
    }
    for (const architecture of ["arm64", "x64"]) {
      const asset = findAsset(new RegExp(`-${architecture}\\.dmg$`, "i"));
      if (asset) releaseAssets.set(`mac:${architecture}`, asset);
    }
    for (const format of ["AppImage", "deb", "rpm"]) {
      const asset = findAsset(new RegExp(`\\.(${format})$`, "i"));
      if (asset) releaseAssets.set(`linux:${format}`, asset);
    }

    updateLinuxDownload();
    updateMacDownload();
    releaseStatus.textContent = `Última versão: ${release.tag_name || release.name || "disponível"}.`;

    for (const button of downloadButtons) {
      if (button.getAttribute("aria-disabled") === "true") {
        const platform = button.dataset.download;
        document.querySelector(`[data-meta="${platform}"]`).textContent =
          "Este instalador ainda não está publicado";
      }
    }
  } catch (error) {
    console.error("Não foi possível carregar os instaladores do EasyDesk:", error);
    releaseStatus.textContent =
      "Não foi possível carregar a versão mais recente. Tenta novamente mais tarde.";
    downloadButtons.forEach(button => {
      button.href = "#downloads";
      button.setAttribute("aria-disabled", "true");
    });
    document.querySelectorAll(".download-meta").forEach(element => {
      element.textContent = "Não foi possível verificar a disponibilidade";
    });
  }
}

linuxFormat.addEventListener("change", updateLinuxDownload);
macArchitecture.addEventListener("change", updateMacDownload);
loadLatestRelease();
