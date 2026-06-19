import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, publicConfig } from "./config.mjs";
import { MexcClient } from "./lib/mexc.mjs";
import { SignalScanner } from "./lib/scanner.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(dirname, "..");
const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"]
]);
const client = new MexcClient(config.mexc);
const scanner = new SignalScanner(client);
const appVersion = "2026.06.19.8";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function dashboard() {
  return {
    config: publicConfig(),
    state: scanner.state
  };
}

async function api(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/signals") {
    return sendJson(response, 200, dashboard());
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      app: "mexc-signal-radar",
      version: appVersion,
      keyRequired: false,
      time: new Date().toISOString()
    });
  }
  if (request.method === "POST" && url.pathname === "/api/scan") {
    await scanner.scan();
    return sendJson(response, 200, dashboard());
  }
  return sendJson(response, 404, { error: "Rota não encontrada" });
}

function staticFile(response, pathname) {
  const requested = publicFiles.get(pathname);
  if (!requested) {
    response.writeHead(404);
    return response.end("Not found");
  }
  const file = path.resolve(projectDir, requested);
  if (!fs.existsSync(file)) {
    response.writeHead(404);
    return response.end("Not found");
  }
  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store"
  });
  fs.createReadStream(file).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(request, response, url);
    return staticFile(response, url.pathname);
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: error.message || "Erro interno" });
  }
});

server.listen(config.port, () => {
  console.log(`MEXC Signal Radar disponível em http://localhost:${config.port}`);
  scanner
    .scan({ force: true })
    .catch((error) => console.error(`Scan inicial: ${error.message}`))
    .finally(scheduleNextScan);
});

const timeframeMilliseconds = {
  Min1: 60_000,
  Min5: 300_000,
  Min15: 900_000,
  Min30: 1_800_000,
  Min60: 3_600_000,
  Hour4: 14_400_000
};
let timer;

function scheduleNextScan() {
  if (timer) clearTimeout(timer);
  const duration =
    timeframeMilliseconds[config.market.timeframe] || config.scanIntervalMs;
  const delay = duration - (Date.now() % duration) + 5_000;
  scanner.state.nextScanAt = new Date(Date.now() + delay).toISOString();
  timer = setTimeout(async () => {
    try {
      await scanner.scan({ force: true });
    } catch (error) {
      console.error(`Scan automático: ${error.message}`);
    } finally {
      scheduleNextScan();
    }
  }, delay);
}

process.on("SIGINT", () => {
  clearTimeout(timer);
  server.close(() => process.exit(0));
});
