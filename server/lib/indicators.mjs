const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export function sma(values, period) {
  const result = Array(values.length).fill(null);
  if (period <= 0) return result;
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += finite(values[index]);
    if (index >= period) sum -= finite(values[index - period]);
    if (index >= period - 1) result[index] = sum / period;
  }
  return result;
}

export function ema(values, period) {
  const result = Array(values.length).fill(null);
  if (!values.length || period <= 0) return result;
  const seedIndex = period - 1;
  if (values.length <= seedIndex) return result;

  const seed = values.slice(0, period).reduce((sum, value) => sum + finite(value), 0) / period;
  result[seedIndex] = seed;
  const multiplier = 2 / (period + 1);
  for (let index = seedIndex + 1; index < values.length; index += 1) {
    result[index] = (finite(values[index]) - result[index - 1]) * multiplier + result[index - 1];
  }
  return result;
}

export function rsi(closes, period = 14) {
  const result = Array(closes.length).fill(null);
  if (closes.length <= period) return result;
  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = finite(closes[index]) - finite(closes[index - 1]);
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = period + 1; index < closes.length; index += 1) {
    const change = finite(closes[index]) - finite(closes[index - 1]);
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] =
      averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
}

export function trueRange(candles) {
  return candles.map((candle, index) => {
    const high = finite(candle.high);
    const low = finite(candle.low);
    if (index === 0) return high - low;
    const previousClose = finite(candles[index - 1].close);
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  });
}

function wilder(values, period) {
  const result = Array(values.length).fill(null);
  if (values.length < period) return result;
  let value = values.slice(0, period).reduce((sum, item) => sum + finite(item), 0) / period;
  result[period - 1] = value;
  for (let index = period; index < values.length; index += 1) {
    value = (value * (period - 1) + finite(values[index])) / period;
    result[index] = value;
  }
  return result;
}

export function atr(candles, period = 14) {
  return wilder(trueRange(candles), period);
}

export function adx(candles, period = 14) {
  const plusDm = Array(candles.length).fill(0);
  const minusDm = Array(candles.length).fill(0);

  for (let index = 1; index < candles.length; index += 1) {
    const up = finite(candles[index].high) - finite(candles[index - 1].high);
    const down = finite(candles[index - 1].low) - finite(candles[index].low);
    plusDm[index] = up > down && up > 0 ? up : 0;
    minusDm[index] = down > up && down > 0 ? down : 0;
  }

  const smoothTr = wilder(trueRange(candles), period);
  const smoothPlus = wilder(plusDm, period);
  const smoothMinus = wilder(minusDm, period);
  const plusDi = Array(candles.length).fill(null);
  const minusDi = Array(candles.length).fill(null);
  const dx = Array(candles.length).fill(null);

  for (let index = period - 1; index < candles.length; index += 1) {
    if (!smoothTr[index]) continue;
    plusDi[index] = 100 * (smoothPlus[index] / smoothTr[index]);
    minusDi[index] = 100 * (smoothMinus[index] / smoothTr[index]);
    const denominator = plusDi[index] + minusDi[index];
    dx[index] = denominator === 0 ? 0 : (100 * Math.abs(plusDi[index] - minusDi[index])) / denominator;
  }

  const validDx = dx.map((value) => value ?? 0);
  const adxValues = wilder(validDx.slice(period - 1), period);
  const result = Array(candles.length).fill(null);
  adxValues.forEach((value, index) => {
    if (value !== null) result[index + period - 1] = value;
  });

  return { adx: result, plusDi, minusDi };
}

export function bollinger(closes, period = 20, deviations = 2) {
  const middle = sma(closes, period);
  const upper = Array(closes.length).fill(null);
  const lower = Array(closes.length).fill(null);
  const width = Array(closes.length).fill(null);

  for (let index = period - 1; index < closes.length; index += 1) {
    const slice = closes.slice(index - period + 1, index + 1).map(Number);
    const mean = middle[index];
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);
    upper[index] = mean + deviations * deviation;
    lower[index] = mean - deviations * deviation;
    width[index] = mean === 0 ? 0 : (upper[index] - lower[index]) / mean;
  }
  return { middle, upper, lower, width };
}

export function percentChange(closes, lookback = 48) {
  if (closes.length <= lookback) return 0;
  const current = finite(closes.at(-1));
  const previous = finite(closes.at(-1 - lookback));
  return previous === 0 ? 0 : current / previous - 1;
}
