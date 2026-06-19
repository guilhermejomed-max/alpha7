const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
let currentConfig = null;
let nextScanAt = null;
const localHostnames = new Set(["127.0.0.1", "localhost", "::1"]);
const staticMode =
  new URLSearchParams(window.location.search).get("static") === "1" ||
  (window.location.protocol === "https:" &&
    !localHostnames.has(window.location.hostname));

const checkLabels = {
  adx: "ADX abaixo de 25",
  bollingerExpansion: "Bollinger sem expansão",
  volume: "Volume abaixo da média",
  relativeStrength: "Fora do ranking de força",
  news: "Janela de notícia",
  liquidity: "Liquidez insuficiente",
  spread: "Spread excessivo",
  normalVolatility: "Volatilidade anormal",
  allowedHour: "Horário bloqueado",
  priceVsEma: "Preço contra EMA200",
  emaSlope: "Inclinação da EMA desalinhada",
  rsiCross: "RSI ainda não cruzou",
  btcRegime: "BTC não confirma",
  higherTimeframe: "Timeframe superior não confirma"
};

const ruleNames = {
  adx: "ADX > 25",
  priceVsEma: "Preço x EMA200",
  emaSlope: "Inclinação EMA200",
  rsiCross: "Cruzamento RSI",
  bollingerExpansion: "Bollinger expandindo",
  volume: "Volume > média 20",
  relativeStrength: "Força relativa",
  btcRegime: "BTC alinhado",
  higherTimeframe: "Timeframe superior",
  liquidity: "Liquidez mínima",
  spread: "Spread aceitável",
  normalVolatility: "Volatilidade normal",
  allowedHour: "Horário permitido",
  news: "Sem notícia bloqueada"
};

async function api(path, options = {}) {
  const url = new URL(path, window.location.origin);
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      },
      cache: "no-store"
    });
  } catch {
    throw new Error(
      "Servidor local indisponível. Execute iniciar-radar.cmd e abra http://127.0.0.1:8787/."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Resposta inválida em ${url.pathname}. Feche esta aba, execute iniciar-radar.cmd e use http://127.0.0.1:8787/.`
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `O servidor retornou dados corrompidos em ${url.pathname}. Reinicie com parar-radar.cmd e iniciar-radar.cmd.`
    );
  }

  if (!response.ok) throw new Error(data.error || "Falha na requisição");
  return data;
}

async function verifyServer() {
  if (staticMode) return { ok: true, app: "mexc-signal-radar-static" };
  const health = await api("/api/health");
  if (health.app !== "mexc-signal-radar") {
    throw new Error(
      "Outro programa está usando a porta 8787. Encerre-o e execute iniciar-radar.cmd novamente."
    );
  }
  return health;
}

async function loadDashboard({ refresh = false } = {}) {
  if (!staticMode) {
    return api(
      refresh ? "/api/scan" : "/api/signals",
      refresh ? { method: "POST" } : {}
    );
  }

  const url = new URL("./signals.json", window.location.href);
  url.searchParams.set("t", String(Date.now()));
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
  } catch {
    throw new Error("Não foi possível acessar a leitura publicada pelo GitHub.");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/json")) {
    throw new Error(
      "A leitura do GitHub ainda não foi publicada. Execute o workflow em Actions."
    );
  }
  return response.json();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

function badge(text, type = "neutral") {
  return `<span class="badge ${type}">${text}</span>`;
}

function formatTime(value) {
  if (!value) return "Aguardando leitura";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}

function directionName(direction) {
  return direction === "long" ? "COMPRA" : direction === "short" ? "VENDA" : "NEUTRO";
}

function statusName(status) {
  return status === "confirmed"
    ? "CONFIRMADO"
    : status === "armed"
      ? "SETUP ARMADO"
      : status === "watch"
        ? "EM OBSERVAÇÃO"
        : "AGUARDANDO";
}

function price(value) {
  if (value === null || value === undefined) return "—";
  return number.format(value);
}

function signalCard(signal) {
  const direction =
    signal.direction !== "none" ? signal.direction : signal.candidateDirection;
  const type = direction === "long" ? "long" : "short";
  const confirmed = signal.status === "confirmed";
  const armed = signal.status === "armed";
  const blocks = (signal.failedChecks || []).map((key) => checkLabels[key] || key);
  const statusLabel = confirmed
    ? "confirmado"
    : armed
      ? "aguarda RSI"
      : "observação";
  return `<article class="signal-card ${type}">
    <div class="signal-card-head">
      <div>
        <span class="signal-symbol">${signal.symbol}</span>
        <h3>${directionName(direction)}${confirmed ? "" : armed ? " ARMADA" : " EM OBSERVAÇÃO"}</h3>
      </div>
      ${badge(statusLabel, confirmed ? (type === "long" ? "success" : "danger") : "neutral")}
    </div>
    <div class="levels">
      <div><span>Entrada</span><strong>${price(signal.entry)}</strong></div>
      <div><span>Stop ATR</span><strong>${price(signal.stop)}</strong></div>
      <div><span>Alvo 1R</span><strong>${price(signal.target1)}</strong></div>
      <div><span>Alvo 2R</span><strong>${price(signal.target2)}</strong></div>
    </div>
    <div class="signal-context">
      <span>ADX <strong>${price(signal.metrics.adx)}</strong></span>
      <span>RSI <strong>${price(signal.metrics.rsi)}</strong></span>
      <span>ATR <strong>${price(signal.metrics.atr)}</strong></span>
      <span>Volume <strong>${price(signal.metrics.volume / signal.metrics.volumeAverage20)}x</strong></span>
    </div>
    <p>${
      confirmed
        ? "+1R: break-even · +2R: parcial · restante: trailing ATR"
        : armed
          ? "Estrutura aprovada. A entrada só confirma após o cruzamento do RSI."
          : `Ainda falta: ${blocks.slice(0, 3).join(" · ")}`
    }</p>
  </article>`;
}

function renderCandidate(signal) {
  if (!signal) return;
  const blocks = (signal.failedChecks || []).map((key) => checkLabels[key] || key);
  $("#candidateSymbol").textContent = signal.symbol;
  $("#candidateDescription").textContent = signal.status === "confirmed"
    ? "Todos os filtros estão aprovados. O sinal também aparece na área de entradas confirmadas."
    : signal.status === "armed"
      ? "Estrutura aprovada. Falta somente o cruzamento do RSI para confirmar a entrada."
    : `${blocks.length} condição(ões) ainda separam este ativo de um sinal confirmado.`;
  $("#candidateScore").textContent = `${signal.qualityScore}%`;
  $("#candidateRing").style.setProperty("--score", `${signal.qualityScore}%`);
  $("#candidateBias").textContent = directionName(signal.candidateDirection);
  $("#candidateBias").className =
    signal.candidateDirection === "long"
      ? "positive"
      : signal.candidateDirection === "short"
        ? "negative"
        : "";
  $("#candidateEntry").textContent = price(signal.entry);
  $("#candidateStop").textContent = price(signal.stop);
  $("#candidateBlock").textContent = blocks[0] || "Nenhum";
}

function render({ config, state }) {
  currentConfig = config;
  nextScanAt = state.nextScanAt || null;
  const signals = state.signals || [];
  const active = signals.filter((signal) => signal.eligible);
  const armed = signals.filter((signal) => signal.status === "armed");
  const watch = signals.filter((signal) => signal.status === "watch").slice(0, 3);
  const opportunities = [...active, ...armed, ...watch];
  const longs = active.filter((signal) => signal.direction === "long");
  const shorts = active.filter((signal) => signal.direction === "short");
  const best = signals[0];
  const btc = state.market?.btcRegime || {};

  const connection = $("#connectionBadge");
  connection.className = `connection ${state.lastError ? "offline" : "online"}`;
  connection.querySelector("span").textContent = state.scanning
    ? "Analisando"
    : state.lastError
      ? "Falha"
      : state.lastWarning
        ? "Dados salvos"
      : "Online";

  $("#btcRegime").textContent =
    btc.direction === "long" ? "Alta" : btc.direction === "short" ? "Baixa" : "Neutro";
  $("#timeframe").textContent = `${config.timeframe} / ${config.higherTimeframe}`;
  $("#lastScan").textContent = formatTime(state.lastScanAt);
  $("#marketCount").textContent = signals.length;
  $("#newsNote").textContent = config.quality.newsCalendarConfirmed
    ? "Calendário de notícias confirmado."
    : state.lastWarning ||
      (staticMode
        ? "Dados calculados pelo GitHub Actions. Confirme notícias antes de entrar."
        : "Atenção: confirme notícias manualmente antes de entrar.");

  $("#validSignals").textContent = active.length;
  $("#longSignals").textContent = longs.length;
  $("#shortSignals").textContent = shorts.length;
  $("#bestScore").textContent = `${best?.qualityScore || 0}%`;
  $("#bestSymbol").textContent = best?.symbol || "Aguardando";
  $("#heroSignalSymbol").textContent = best
    ? `${best.symbol} · ${directionName(best.candidateDirection)}`
    : "Aguardando";
  $("#heroSignalStatus").textContent = statusName(best?.status);
  $("#heroSignalStatus").className =
    best?.status === "confirmed"
      ? "confirmed"
      : best?.status === "watch"
        ? "watch"
        : "";
  $("#heroSignalScore").textContent = `${best?.qualityScore || 0}%`;

  const activeBadge = $("#activeBadge");
  activeBadge.className = `section-badge ${opportunities.length ? "active" : ""}`;
  activeBadge.textContent = active.length
    ? `${active.length} confirmado(s)`
    : armed.length
      ? `${armed.length} armado(s) · ${watch.length} observado(s)`
      : watch.length
        ? `${watch.length} em observação`
        : "Nenhuma agora";
  $("#activeSignals").innerHTML = opportunities.length
    ? opportunities.map(signalCard).join("")
    : `<div class="no-signal">
        <strong>O melhor sinal agora é esperar.</strong>
        <span>Nenhum ativo passou por todos os filtros. O radar continuará acompanhando o mercado sem fabricar uma entrada.</span>
      </div>`;

  renderCandidate(best);

  $("#signalsTable").innerHTML = signals.length
    ? signals
        .map((signal) => {
          const metrics = signal.metrics || {};
          const ratio = metrics.volumeAverage20
            ? metrics.volume / metrics.volumeAverage20
            : 0;
          const candidate = signal.candidateDirection;
          const blocks = (signal.failedChecks || []).map((key) => checkLabels[key] || key);
          return `<tr>
            <td><strong>${signal.symbol}</strong></td>
            <td class="direction-${candidate}">${directionName(candidate)}</td>
            <td><span class="score"><i style="width:${signal.qualityScore}%"></i></span>${signal.qualityScore}%</td>
            <td>${price(metrics.adx)}</td>
            <td>${price(metrics.rsi)}</td>
            <td class="${(metrics.emaSlopePct || 0) >= 0 ? "positive" : "negative"}">${price(metrics.emaSlopePct)}%</td>
            <td>${price(ratio)}x</td>
            <td>#${metrics.relativeStrengthRank || "—"}</td>
            <td class="blocks" title="${blocks.join(" · ")}">${blocks.slice(0, 2).join(" · ") || "Sinal completo"}</td>
          </tr>`;
        })
        .join("")
    : '<tr><td colspan="9" class="empty">A primeira leitura está sendo preparada.</td></tr>';

  const ranking = state.market?.relativeStrength || [];
  const maximum = Math.max(...ranking.map((item) => Math.abs(item.score)), 0.01);
  $("#rankingList").innerHTML = ranking.length
    ? ranking
        .slice(0, 9)
        .map(
          (item, index) => `<div class="ranking-row">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>${item.symbol}</strong>
              <div class="ranking-bar"><i style="width:${Math.max(4, (Math.abs(item.score) / maximum) * 100)}%"></i></div>
            </div>
            <span class="${item.score >= 0 ? "positive" : "negative"}">${price(item.score * 100)}%</span>
          </div>`
        )
        .join("")
    : '<p class="empty">Aguardando leitura.</p>';

  const referenceChecks = best?.checks || {};
  $("#rulesList").innerHTML = Object.entries(ruleNames)
    .map(
      ([key, label]) => `<div class="rule ${referenceChecks[key] ? "passed" : ""}">
        <span class="check-dot"></span>
        <div>
          <strong>${label}</strong>
          <small>${referenceChecks[key] ? "Aprovado" : "Pendente"}</small>
        </div>
      </div>`
    )
    .join("");
}

const timeframeMilliseconds = {
  Min1: 60_000,
  Min5: 300_000,
  Min15: 900_000,
  Min30: 1_800_000,
  Min60: 3_600_000,
  Hour4: 14_400_000
};

function updateCandleCountdown() {
  if (!currentConfig) return;
  const duration = timeframeMilliseconds[currentConfig.timeframe] || 300_000;
  const scheduled = Date.parse(nextScanAt || "");
  const remaining = Number.isFinite(scheduled)
    ? Math.max(0, scheduled - Date.now())
    : duration - (Date.now() % duration);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  $("#interval").textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} · ${currentConfig.timeframe}`;
}

async function load() {
  try {
    await verifyServer();
    render(await loadDashboard());
  } catch (error) {
    const connection = $("#connectionBadge");
    connection.className = "connection offline";
    connection.querySelector("span").textContent = "Offline";
    showToast(error.message);
  }
}

async function scan() {
  const button = $("#scanButton");
  button.disabled = true;
  button.querySelector("span").textContent = "Analisando mercado";
  try {
    await verifyServer();
    const data = await loadDashboard({ refresh: true });
    render(data);
    showToast(
      staticMode
        ? "Última leitura publicada pelo GitHub carregada."
        : data.state.servedFromCache
          ? "A última leitura ainda é recente e foi mantida."
          : "Leitura de mercado atualizada."
    );
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Atualizar mercado";
  }
}

if (window.location.protocol !== "file:") {
  $("#hostingMode").textContent = staticMode ? "GitHub Pages" : "Servidor local";
  $("#scanButton").addEventListener("click", scan);
  load();
  setInterval(load, 30_000);
  setInterval(updateCandleCountdown, 1_000);
}
