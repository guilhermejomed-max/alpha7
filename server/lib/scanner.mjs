import { config } from "../config.mjs";
import { percentChange } from "./indicators.mjs";
import { evaluateEntry, marketRegime } from "./strategy.mjs";

async function mapWithConcurrency(items, limit, callback) {
  const results = Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

const intervalMilliseconds = {
  Min1: 60_000,
  Min5: 300_000,
  Min15: 900_000,
  Min30: 1_800_000,
  Min60: 3_600_000,
  Hour4: 14_400_000,
  Hour8: 28_800_000,
  Day1: 86_400_000
};

function onlyClosedCandles(candles, interval, now = Date.now()) {
  const duration = intervalMilliseconds[interval] || 900_000;
  const closed = candles.filter((candle) => Number(candle.time) + duration <= now);
  return closed.length >= 230 ? closed : candles.slice(0, -1);
}

export class SignalScanner {
  constructor(client) {
    this.client = client;
    this.state = {
      scanning: false,
      lastScanAt: null,
      lastScanDurationMs: null,
      lastError: null,
      lastWarning: null,
      servedFromCache: false,
      signals: [],
      market: {}
    };
    this.scanPromise = null;
  }

  newsGate(now = Date.now()) {
    const active = config.news.blackouts.find((event) => {
      const start = Date.parse(event.start);
      const end = Date.parse(event.end);
      return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
    });
    if (active) return { allowed: false, reason: `noticia:${active.title || "alto_impacto"}` };
    return {
      allowed: true,
      reason: config.news.calendarConfirmed
        ? "calendario_confirmado"
        : "confirmar_noticias_manualmente"
    };
  }

  async scan({ force = false } = {}) {
    if (this.scanPromise) return this.scanPromise;
    const lastScanTime = Date.parse(this.state.lastScanAt || "");
    const cacheIsFresh =
      Number.isFinite(lastScanTime) &&
      Date.now() - lastScanTime < config.scanCooldownMs;
    if (!force && cacheIsFresh && this.state.signals.length) {
      this.state.servedFromCache = true;
      return this.state;
    }
    this.scanPromise = this.performScan().finally(() => {
      this.scanPromise = null;
    });
    return this.scanPromise;
  }

  async performScan() {
    const startedAt = Date.now();
    this.state.scanning = true;
    try {
      const tickerData = await this.client.tickers();
      const tickers = Array.isArray(tickerData) ? tickerData : [tickerData];
      const tickerBySymbol = Object.fromEntries(tickers.map((ticker) => [ticker.symbol, ticker]));
      const symbols = config.market.watchlist.filter((symbol) => tickerBySymbol[symbol]);
      const marketSeries = await mapWithConcurrency(symbols, 2, async (symbol) => {
        const [rawCandles, rawHigherCandles] = await Promise.all([
          this.client.candles(symbol, config.market.timeframe, 320),
          this.client.candles(symbol, config.market.higherTimeframe, 240)
        ]);
        return {
          symbol,
          candles: onlyClosedCandles(rawCandles, config.market.timeframe),
          higherCandles: onlyClosedCandles(
            rawHigherCandles,
            config.market.higherTimeframe
          )
        };
      });
      const candlesBySymbol = Object.fromEntries(
        marketSeries.map((item) => [item.symbol, item.candles])
      );
      const higherBySymbol = Object.fromEntries(
        marketSeries.map((item) => [item.symbol, item.higherCandles])
      );

      const strength = symbols
        .map((symbol) => ({
          symbol,
          score: percentChange(candlesBySymbol[symbol].map((candle) => candle.close), 48)
        }))
        .sort((left, right) => right.score - left.score);
      const longRank = Object.fromEntries(strength.map((item, index) => [item.symbol, index + 1]));
      const shortRank = Object.fromEntries(
        [...strength].reverse().map((item, index) => [item.symbol, index + 1])
      );
      const btcCandles =
        candlesBySymbol.BTC_USDT ||
        (await this.client.candles("BTC_USDT", config.market.timeframe, 320));
      const btcRegime = marketRegime(btcCandles, config.strategy, {
        requireAdx: false
      });
      const news = this.newsGate();
      const signals = symbols.map((symbol) =>
        evaluateEntry({
          symbol,
          candles: candlesBySymbol[symbol],
          higherCandles: higherBySymbol[symbol],
          ticker: tickerBySymbol[symbol],
          longStrengthRank: longRank[symbol],
          shortStrengthRank: shortRank[symbol],
          maxRelativeStrengthRank: config.market.relativeStrengthTopN,
          btcRegime,
          newsGate: news,
          settings: config.strategy,
          marketSettings: config.market
        })
      );

      this.state = {
        scanning: false,
        lastScanAt: new Date().toISOString(),
        lastScanDurationMs: Date.now() - startedAt,
        lastError: null,
        lastWarning: null,
        servedFromCache: false,
        signals: signals.sort(
          (left, right) =>
            Number(right.eligible) - Number(left.eligible) ||
            right.qualityScore - left.qualityScore
        ),
        market: { btcRegime, relativeStrength: strength, news }
      };
      return this.state;
    } catch (error) {
      this.state.scanning = false;
      if (this.state.signals.length) {
        this.state.lastWarning = `${error.message}. Exibindo a última leitura válida.`;
        this.state.servedFromCache = true;
        return this.state;
      }
      this.state.lastError = error.message;
      throw error;
    }
  }
}
