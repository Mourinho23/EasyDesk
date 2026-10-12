const express = require("express");
const cors = require("cors");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const si = require("systeminformation");

const app = express();
const PORT = process.env.PORT || 3000;

function verificarEstadoXcode() {
  if (process.platform !== "darwin") return null;

  try {
    execFileSync("xcodebuild", ["-checkFirstLaunchStatus"], {
      stdio: "ignore",
      timeout: 3000
    });
    return "ready";
  } catch (erro) {
    return erro.code === "ENOENT" ? "not-installed" : "setup-required";
  }
}

const estadoXcode = verificarEstadoXcode();

app.use(cors());
app.use(express.static(path.join(__dirname, "Interface")));

let clientes = [];

function arredondar(valor, casas = 1) {
  if (valor === undefined || valor === null || Number.isNaN(valor)) {
    return null;
  }

  return Number(Number(valor).toFixed(casas));
}

async function recolherDados() {
  const [
    sistema,
    cpu,
    temperatura,
    memoria,
    discos,
    armazenamento,
    graficos,
    rede,
    bateria,
    processos,
    sistemaOperativo,
    carga,
    firmware,
    placaMae
  ] = await Promise.allSettled([
    si.system(),
    si.cpu(),
    si.cpuTemperature(),
    si.mem(),
    si.diskLayout(),
    si.fsSize(),
    si.graphics(),
    si.networkInterfaces(),
    si.battery(),
    si.processes(),
    si.osInfo(),
    si.currentLoad(),
    si.bios(),
    si.baseboard()
  ]);

  const resultado = valor => {
    return valor.status === "fulfilled" ? valor.value : null;
  };

  const temp = resultado(temperatura) || {};
  const mem = resultado(memoria) || {};
  const load = resultado(carga) || {};
  const osInfo = resultado(sistemaOperativo) || {};
  const volumesArmazenamento = resultado(armazenamento) || [];
  const unidadeSistema = process.platform === "win32"
    ? (process.env.SystemDrive || "C:").toLowerCase()
    : null;
  const volumePrincipal = process.platform === "win32"
    ? volumesArmazenamento.find(volume =>
      (volume.mount || "").toLowerCase() === unidadeSistema
    ) || volumesArmazenamento[0]
    : process.platform === "darwin"
      ? volumesArmazenamento.find(volume =>
        volume.mount === "/System/Volumes/Data"
      ) || volumesArmazenamento.find(volume => volume.mount === "/") ||
        volumesArmazenamento[0]
      : volumesArmazenamento.find(volume => volume.mount === "/") ||
        volumesArmazenamento[0];

  return {
    momento: new Date().toISOString(),
    utilizador: os.userInfo().username || null,

    ambiente: {
      plataforma: process.platform,
      xcode: estadoXcode
    },

    computador: {
      nome: os.hostname(),
      fabricante: resultado(sistema)?.manufacturer || null,
      modelo: resultado(sistema)?.model || null,
      numeroSerie: resultado(sistema)?.serial || null,
      nomeSistema: osInfo.distro || null,
      sistema: `${osInfo.distro || ""} ${osInfo.release || ""}`.trim(),
      versao: osInfo.release || null,
      arquitetura: os.arch(),
      uptimeSegundos: os.uptime()
    },

    firmware: {
      fabricante: resultado(firmware)?.vendor || null,
      versao: resultado(firmware)?.version || null,
      data: resultado(firmware)?.releaseDate || null
    },

    placaMae: {
      fabricante: resultado(placaMae)?.manufacturer || null,
      modelo: resultado(placaMae)?.model || null,
      versao: resultado(placaMae)?.version || null
    },

    cpu: {
      fabricante: resultado(cpu)?.manufacturer || null,
      modelo: resultado(cpu)?.brand || null,
      velocidadeGHz: resultado(cpu)?.speed || null,
      nucleosFisicos: resultado(cpu)?.physicalCores || null,
      nucleosLogicos: resultado(cpu)?.cores || null,
      usoPercentagem: arredondar(load.currentLoad),
      temperaturaCelsius: arredondar(temp.main)
    },

    memoria: {
      totalBytes: mem.total || null,
      usadaBytes: mem.used || null,
      livreBytes: mem.free || null,
      usoPercentagem: mem.total
        ? arredondar((mem.used / mem.total) * 100)
        : null
    },

    discos: (resultado(discos) || []).map(disco => ({
      dispositivo: disco.device || null,
      nome: disco.name || null,
      fabricante: disco.vendor || null,
      modelo: disco.model || null,
      tamanhoBytes: disco.size || null,
      tipo: disco.type || null,
      interface: disco.interfaceType || null,
      temperaturaCelsius: arredarTemperatura(disco.temperature)
    })),

    armazenamento: volumesArmazenamento.map(disco => ({
      sistemaFicheiros: disco.fs || null,
      montagem: disco.mount || null,
      tamanhoBytes: disco.size || null,
      usadoBytes: disco.used || null,
      disponivelBytes: disco.available || null,
      usoPercentagem: arredondar(disco.use),
      principal: disco === volumePrincipal
    })),

    gpu: (resultado(graficos)?.controllers || []).map(gpu => ({
      fabricante: gpu.vendor || null,
      modelo: gpu.model || null,
      memoriaBytes: gpu.vram ? gpu.vram * 1024 * 1024 : null,
      temperaturaCelsius: arredarTemperatura(gpu.temperatureGpu),
      usoPercentagem: arredondar(gpu.utilizationGpu),
      memoriaUsadaPercentagem: arredondar(gpu.memoryUsed)
    })),

    rede: (resultado(rede) || [])
      .filter(interface => !interface.internal)
      .map(interface => ({
        nome: interface.iface,
        ip4: interface.ip4 || null,
        ip6: interface.ip6 || null,
        velocidadeMbps: interface.speed || null,
        estado: interface.operstate || null
      })),

    bateria: resultado(bateria),

    processos: {
      total: resultado(processos)?.all || null,
      ativos: resultado(processos)?.running || null,
      bloqueados: resultado(processos)?.blocked || null
    }
  };
}

function arredarTemperatura(valor) {
  return valor === undefined || valor === null
    ? null
    : arredondar(valor);
}

app.get("/api/info", async (req, res) => {
  try {
    res.json(await recolherDados());
  } catch (erro) {
    res.status(500).json({
      erro: "Não foi possível recolher os dados do computador",
      detalhe: erro.message
    });
  }
});

app.get("/events", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clientes.push(res);

  const enviar = async () => {
    try {
      const dados = await recolherDados();
      res.write(`data: ${JSON.stringify(dados)}\n\n`);
    } catch (erro) {
      res.write(`event: erro\ndata: ${JSON.stringify({
        mensagem: erro.message
      })}\n\n`);
    }
  };

  await enviar();

  const intervalo = setInterval(enviar, 2000);

  req.on("close", () => {
    clearInterval(intervalo);
    clientes = clientes.filter(cliente => cliente !== res);
    res.end();
  });
});

const interfacesRede = Object.values(os.networkInterfaces()).flat();
const interfaceLocal = interfacesRede.find(interfaceRede => {
  if (!interfaceRede || interfaceRede.family !== "IPv4" || interfaceRede.internal) {
    return false;
  }

  const octetos = interfaceRede.address.split(".").map(Number);

  return octetos[0] === 10 ||
    (octetos[0] === 172 && octetos[1] >= 16 && octetos[1] <= 31) ||
    (octetos[0] === 192 && octetos[1] === 168);
});
const enderecoLocal = interfaceLocal?.address || "127.0.0.1";

app.listen(PORT, enderecoLocal, () => {
  console.log(`Painel disponível em http://${enderecoLocal}:${PORT}`);
});