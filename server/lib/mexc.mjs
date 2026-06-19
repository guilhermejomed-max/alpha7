export class MexcClient {
  constructor({ baseUrl }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request(path, { query = {} } = {}) {
    const cleanQuery = Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== null && value !== undefined)
    );
    const search = new URLSearchParams(
      Object.entries(cleanQuery).sort(([left], [right]) => left.localeCompare(right))
    ).toString();
    const url = `${this.baseUrl}${path}${search ? `?${search}` : ""}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response;
      try {
        response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(12_000)
        });
      } catch (error) {
        if (error.name === "TimeoutError") {
          throw new Error(`Tempo limite excedido ao consultar ${path}`);
        }
        throw error;
      }
      const data = await response.json().catch(() => null);
      const message = data?.message || "";
      const rateLimited =
        response.status === 429 || /too frequent|frequentes|rate limit/i.test(message);
      if (rateLimited && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
        continue;
      }
      if (!response.ok || !data?.success) {
        throw new Error(message || `MEXC respondeu HTTP ${response.status}`);
      }
      return data.data;
    }
    throw new Error("Não foi possível consultar a MEXC");
  }

  serverTime() {
    return this.request("/api/v1/contract/ping");
  }

  tickers() {
    return this.request("/api/v1/contract/ticker");
  }

  contractDetails() {
    return this.request("/api/v1/contract/detail");
  }

  async candles(symbol, interval, limit = 300) {
    const secondsByInterval = {
      Min1: 60,
      Min5: 300,
      Min15: 900,
      Min30: 1800,
      Min60: 3600,
      Hour4: 14_400,
      Hour8: 28_800,
      Day1: 86_400
    };
    const step = secondsByInterval[interval] || 900;
    const end = Math.floor(Date.now() / 1000);
    const start = end - step * limit;
    const data = await this.request(`/api/v1/contract/kline/${encodeURIComponent(symbol)}`, {
      query: { interval, start, end }
    });
    return (data.time || []).map((time, index) => ({
      time: Number(time) * 1000,
      open: Number(data.open[index]),
      high: Number(data.high[index]),
      low: Number(data.low[index]),
      close: Number(data.close[index]),
      volume: Number(data.vol[index])
    }));
  }

}
