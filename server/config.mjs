import fs from "node:fs";
import path from "node:path";

function loadDotEnv() {
  const file = path.resolve(".env");
  if (!fs.existsSync(file)) return;

  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const number = (key, fallback) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
};

const boolean = (key, fallback = false) => {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const list = (key, fallback = []) =>
  (process.env[key] || fallback.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const json = (key, fallback) => {
  try {
    return JSON.parse(process.env[key] || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

export const config = {
  port: number("PORT", 8787),
  mexc: {
    baseUrl: process.env.MEXC_BASE_URL || "https://api.mexc.com"
  },
  scanIntervalMs: number("SCAN_INTERVAL_MS", 300_000),
  scanCooldownMs: number("SCAN_COOLDOWN_MS", 30_000),
  market: {
    watchlist: list("WATCHLIST", [
      "BTC_USDT",
      "ETH_USDT",
      "SOL_USDT",
      "XRP_USDT",
      "BNB_USDT",
      "DOGE_USDT",
      "ADA_USDT",
      "LINK_USDT",
      "AVAX_USDT"
    ]),
    timeframe: process.env.TIMEFRAME || "Min15",
    higherTimeframe: process.env.HIGHER_TIMEFRAME || "Hour4",
    relativeStrengthTopN: number("RELATIVE_STRENGTH_TOP_N", 5),
    minTurnover: number("MIN_24H_TURNOVER_USDT", 5_000_000),
    maxSpreadPct: number("MAX_SPREAD_PCT", 0.15),
    maxAtrPct: number("MAX_ATR_PCT", 8),
    allowedUtcHours: list("ALLOWED_UTC_HOURS").map(Number)
  },
  strategy: {
    adxMin: number("ADX_MIN", 25),
    emaSlopeLookback: number("EMA_SLOPE_LOOKBACK", 5),
    bbPeriod: number("BB_PERIOD", 20),
    bbStdDev: number("BB_STDDEV", 2),
    bbExpansionFactor: number("BB_EXPANSION_FACTOR", 1.05),
    atrPeriod: number("ATR_PERIOD", 14),
    atrStopMultiplier: number("ATR_STOP_MULTIPLIER", 2),
    atrTrailMultiplier: number("ATR_TRAIL_MULTIPLIER", 2.5),
    volumePeriod: number("VOLUME_PERIOD", 20)
  },
  news: {
    blackouts: json("NEWS_BLACKOUTS_JSON", []),
    calendarConfirmed: boolean("NEWS_CALENDAR_CONFIRMED", false)
  }
};

export function publicConfig() {
  return {
    apiKeyRequired: false,
    scanIntervalMs: config.scanIntervalMs,
    scanCooldownMs: config.scanCooldownMs,
    watchlist: config.market.watchlist,
    timeframe: config.market.timeframe,
    higherTimeframe: config.market.higherTimeframe,
    strategy: config.strategy,
    quality: {
      minTurnover: config.market.minTurnover,
      maxSpreadPct: config.market.maxSpreadPct,
      maxAtrPct: config.market.maxAtrPct,
      allowedUtcHours: config.market.allowedUtcHours,
      newsCalendarConfirmed: config.news.calendarConfirmed
    }
  };
}
