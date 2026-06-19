import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEntry, marketRegime } from "../server/lib/strategy.mjs";

function trendingCandles(direction = 1) {
  return Array.from({ length: 260 }, (_, index) => {
    const base = direction === 1 ? 100 + index * 0.8 : 400 - index * 0.8;
    return {
      time: index,
      open: base - direction * 0.2,
      high: base + 1.2,
      low: base - 1.2,
      close: base,
      volume: 1000 + index
    };
  });
}

const settings = { adxMin: 25, emaSlopeLookback: 5 };

test("Regime identifica tendência de alta alinhada à EMA200", () => {
  assert.equal(marketRegime(trendingCandles(1), settings).direction, "long");
});

test("Regime identifica tendência de baixa alinhada à EMA200", () => {
  assert.equal(marketRegime(trendingCandles(-1), settings).direction, "short");
});

test("Regime BTC pode confirmar direção sem exigir ADX mínimo", () => {
  const candles = trendingCandles(-1);
  const strictSettings = { adxMin: 101, emaSlopeLookback: 5 };
  assert.equal(marketRegime(candles, strictSettings).direction, "neutral");
  assert.equal(
    marketRegime(candles, strictSettings, { requireAdx: false }).direction,
    "short"
  );
});

test("Candidato de compra recebe entrada, stop e alvos em ordem correta", () => {
  const candles = trendingCandles(1);
  const signal = evaluateEntry({
    symbol: "TEST_USDT",
    candles,
    higherCandles: candles,
    ticker: { bid1: 307, ask1: 307.1, lastPrice: 307.05, amount24: 10_000_000 },
    longStrengthRank: 1,
    shortStrengthRank: 9,
    maxRelativeStrengthRank: 5,
    btcRegime: { direction: "long" },
    newsGate: { allowed: true, reason: "ok" },
    settings: {
      ...settings,
      bbPeriod: 20,
      bbStdDev: 2,
      bbExpansionFactor: 1.05,
      atrPeriod: 14,
      atrStopMultiplier: 2,
      volumePeriod: 20
    },
    marketSettings: {
      minTurnover: 1,
      maxSpreadPct: 1,
      maxAtrPct: 100,
      allowedUtcHours: []
    }
  });
  assert.equal(signal.candidateDirection, "long");
  assert.ok(signal.stop < signal.entry);
  assert.ok(signal.target1 > signal.entry);
  assert.ok(signal.target2 > signal.target1);
});
