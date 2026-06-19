import { adx, atr, bollinger, ema, rsi, sma } from "./indicators.mjs";

const last = (values, offset = 0) => values[values.length - 1 - offset];
const round = (value, digits = 4) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

export function marketRegime(candles, settings, { requireAdx = true } = {}) {
  if (candles.length < 210) return { direction: "neutral", reason: "candles_insuficientes" };
  const closes = candles.map((candle) => Number(candle.close));
  const ema200 = ema(closes, 200);
  const adxValues = adx(candles, 14).adx;
  const slopeBase = last(ema200, settings.emaSlopeLookback);
  const slope = slopeBase ? (last(ema200) - slopeBase) / slopeBase : 0;
  const trending = !requireAdx || last(adxValues) >= settings.adxMin;
  const direction =
    trending && last(closes) > last(ema200) && slope > 0
      ? "long"
      : trending && last(closes) < last(ema200) && slope < 0
        ? "short"
        : "neutral";
  return {
    direction,
    close: round(last(closes)),
    ema200: round(last(ema200)),
    emaSlopePct: round(slope * 100),
    adx: round(last(adxValues), 2)
  };
}

export function evaluateEntry({
  symbol,
  candles,
  higherCandles,
  ticker,
  longStrengthRank,
  shortStrengthRank,
  maxRelativeStrengthRank,
  btcRegime,
  newsGate,
  settings,
  marketSettings
}) {
  if (candles.length < 230) {
    return { symbol, direction: "none", eligible: false, reason: "candles_insuficientes" };
  }

  const closes = candles.map((candle) => Number(candle.close));
  const volumes = candles.map((candle) => Number(candle.volume));
  const ema200Values = ema(closes, 200);
  const rsiValues = rsi(closes, 14);
  const atrValues = atr(candles, settings.atrPeriod);
  const adxValues = adx(candles, 14);
  const bands = bollinger(closes, settings.bbPeriod, settings.bbStdDev);
  const volumeAverage = sma(volumes, settings.volumePeriod);
  const widthAverage = sma(
    bands.width.map((value) => value ?? 0),
    settings.bbPeriod
  );
  const higherRegime = marketRegime(higherCandles, settings);

  const close = last(closes);
  const ema200 = last(ema200Values);
  const emaSlopeBase = last(ema200Values, settings.emaSlopeLookback);
  const emaSlope = emaSlopeBase ? (ema200 - emaSlopeBase) / emaSlopeBase : 0;
  const currentRsi = last(rsiValues);
  const previousRsi = last(rsiValues, 1);
  const currentAdx = last(adxValues.adx);
  const currentAtr = last(atrValues);
  const currentWidth = last(bands.width);
  const averageWidth = last(widthAverage);
  const currentVolume = last(volumes);
  const averageVolume = last(volumeAverage, 1) ?? last(volumeAverage);
  const spreadPct =
    ticker?.ask1 && ticker?.bid1
      ? ((Number(ticker.ask1) - Number(ticker.bid1)) / Number(ticker.lastPrice)) * 100
      : Infinity;
  const atrPct = currentAtr ? (currentAtr / close) * 100 : Infinity;
  const hourAllowed =
    marketSettings.allowedUtcHours.length === 0 ||
    marketSettings.allowedUtcHours.includes(new Date().getUTCHours());
  const candidateDirection =
    close > ema200 && emaSlope > 0
      ? "long"
      : close < ema200 && emaSlope < 0
        ? "short"
        : "neutral";
  const relativeStrengthRank =
    candidateDirection === "short" ? shortStrengthRank : longStrengthRank;

  const common = {
    adx: currentAdx >= settings.adxMin,
    bollingerExpansion:
      currentWidth !== null &&
      averageWidth !== null &&
      currentWidth > averageWidth * settings.bbExpansionFactor,
    volume: currentVolume > averageVolume,
    relativeStrength: relativeStrengthRank <= maxRelativeStrengthRank,
    news: newsGate.allowed,
    liquidity: Number(ticker?.amount24 || 0) >= marketSettings.minTurnover,
    spread: spreadPct <= marketSettings.maxSpreadPct,
    normalVolatility: atrPct <= marketSettings.maxAtrPct,
    allowedHour: hourAllowed
  };

  const longChecks = {
    ...common,
    priceVsEma: close > ema200,
    emaSlope: emaSlope > 0,
    rsiCross: previousRsi <= 30 && currentRsi > 30,
    btcRegime: btcRegime.direction === "long",
    higherTimeframe: higherRegime.direction === "long"
  };
  const shortChecks = {
    ...common,
    priceVsEma: close < ema200,
    emaSlope: emaSlope < 0,
    rsiCross: previousRsi >= 70 && currentRsi < 70,
    btcRegime: btcRegime.direction === "short",
    higherTimeframe: higherRegime.direction === "short"
  };

  const allTrue = (checks) => Object.values(checks).every(Boolean);
  const direction = allTrue(longChecks) ? "long" : allTrue(shortChecks) ? "short" : "none";
  const checks =
    direction === "short" || candidateDirection === "short" ? shortChecks : longChecks;
  const setupChecks = Object.entries(checks).filter(([name]) => name !== "rsiCross");
  const setupReady =
    candidateDirection !== "neutral" && setupChecks.every(([, passed]) => passed);
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;
  const qualityScore = round((passedChecks / totalChecks) * 100, 0);
  const status =
    direction !== "none"
      ? "confirmed"
      : setupReady
        ? "armed"
        : candidateDirection !== "neutral" && qualityScore >= 65
          ? "watch"
          : "waiting";
  const stop =
    direction === "long"
      ? close - currentAtr * settings.atrStopMultiplier
      : direction === "short"
        ? close + currentAtr * settings.atrStopMultiplier
        : candidateDirection === "long"
          ? close - currentAtr * settings.atrStopMultiplier
          : candidateDirection === "short"
            ? close + currentAtr * settings.atrStopMultiplier
            : null;
  const riskDistance = stop === null ? null : Math.abs(close - stop);
  const target1 =
    candidateDirection === "long"
      ? close + riskDistance
      : candidateDirection === "short"
        ? close - riskDistance
        : null;
  const target2 =
    candidateDirection === "long"
      ? close + riskDistance * 2
      : candidateDirection === "short"
        ? close - riskDistance * 2
        : null;

  return {
    symbol,
    direction,
    candidateDirection,
    eligible: direction !== "none",
    status,
    setupReady,
    qualityScore,
    checks,
    failedChecks: Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name),
    metrics: {
      close: round(close),
      ema200: round(ema200),
      emaSlopePct: round(emaSlope * 100),
      rsi: round(currentRsi, 2),
      previousRsi: round(previousRsi, 2),
      adx: round(currentAdx, 2),
      plusDi: round(last(adxValues.plusDi), 2),
      minusDi: round(last(adxValues.minusDi), 2),
      atr: round(currentAtr),
      atrPct: round(atrPct, 2),
      bollingerWidth: round(currentWidth, 6),
      averageBollingerWidth: round(averageWidth, 6),
      volume: round(currentVolume, 2),
      volumeAverage20: round(averageVolume, 2),
      spreadPct: round(spreadPct, 3),
      relativeStrengthRank,
      higherTimeframeRegime: higherRegime.direction
    },
    stop: round(stop),
    entry: round(close),
    target1: round(target1),
    target2: round(target2),
    context: {
      btcRegime: btcRegime.direction,
      news: newsGate.reason
    }
  };
}
