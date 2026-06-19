import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, publicConfig } from "../server/config.mjs";
import { MexcClient } from "../server/lib/mexc.mjs";
import { SignalScanner } from "../server/lib/scanner.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const distDir = path.join(projectDir, "dist");
const client = new MexcClient(config.mexc);
const scanner = new SignalScanner(client);

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const filename of ["index.html", "styles.css", "app.js"]) {
  fs.copyFileSync(path.join(projectDir, filename), path.join(distDir, filename));
}

const state = await scanner.scan({ force: true });
const payload = {
  config: publicConfig(),
  state: {
    ...state,
    source: "github-actions",
    generatedAt: new Date().toISOString(),
    nextScanAt: new Date(Date.now() + config.scanIntervalMs).toISOString()
  }
};

fs.writeFileSync(
  path.join(distDir, "signals.json"),
  JSON.stringify(payload, null, 2)
);
fs.writeFileSync(path.join(distDir, ".nojekyll"), "");

console.log(`Site gerado com ${state.signals.length} mercados.`);
