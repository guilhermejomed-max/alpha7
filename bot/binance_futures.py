from __future__ import annotations

import hashlib
import hmac
import json
import time
from decimal import Decimal, ROUND_DOWN
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from bot.models import Candle


class BinanceFuturesClient:
    def __init__(self, api_key: str, api_secret: str, testnet: bool, recv_window: int) -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self.recv_window = recv_window
        self.base_url = "https://testnet.binancefuture.com" if testnet else "https://fapi.binance.com"
        self.headers = {"X-MBX-APIKEY": api_key} if api_key else {}

    def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        signed: bool = False,
    ) -> Any:
        payload = dict(params or {})
        if signed:
            if not self.api_key or not self.api_secret:
                raise RuntimeError("BINANCE_API_KEY and BINANCE_API_SECRET are required for signed requests")
            payload.setdefault("recvWindow", self.recv_window)
            payload["timestamp"] = int(time.time() * 1000)
            query = urlencode(payload, doseq=True)
            signature = hmac.new(self.api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
            payload["signature"] = signature

        query = urlencode(payload, doseq=True)
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{query}"

        request = Request(url, method=method, headers=self.headers)
        try:
            with urlopen(request, timeout=15) as response:
                body = response.read().decode("utf-8")
        except Exception as exc:
            raise RuntimeError(f"Binance request failed: {exc}") from exc

        return json.loads(body)

    def klines(self, symbol: str, interval: str, limit: int) -> list[Candle]:
        rows = self._request("GET", "/fapi/v1/klines", {"symbol": symbol, "interval": interval, "limit": limit})
        candles = [
            Candle(
                open_time=int(row[0]),
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
                volume=float(row[5]),
                close_time=int(row[6]),
            )
            for row in rows
        ]
        now_ms = int(time.time() * 1000)
        return [c for c in candles if c.close_time < now_ms]

    def exchange_info(self, symbol: str) -> dict[str, Any]:
        info = self._request("GET", "/fapi/v1/exchangeInfo", {"symbol": symbol})
        return info["symbols"][0]

    def set_leverage(self, symbol: str, leverage: int) -> Any:
        return self._request("POST", "/fapi/v1/leverage", {"symbol": symbol, "leverage": leverage}, signed=True)

    def position_amt(self, symbol: str) -> float:
        rows = self._request("GET", "/fapi/v2/positionRisk", {"symbol": symbol}, signed=True)
        return sum(float(row["positionAmt"]) for row in rows)

    def open_orders(self, symbol: str) -> list[dict[str, Any]]:
        return self._request("GET", "/fapi/v1/openOrders", {"symbol": symbol}, signed=True)

    def new_order(self, **params: Any) -> Any:
        return self._request("POST", "/fapi/v1/order", params, signed=True)


def _filter_value(symbol_info: dict[str, Any], filter_type: str, key: str) -> Decimal:
    for item in symbol_info["filters"]:
        if item["filterType"] == filter_type:
            return Decimal(item[key])
    raise KeyError(f"Filter {filter_type}.{key} not found")


def round_quantity(symbol_info: dict[str, Any], quantity: float) -> str:
    step = _filter_value(symbol_info, "LOT_SIZE", "stepSize")
    rounded = Decimal(str(quantity)).quantize(step, rounding=ROUND_DOWN)
    return format(rounded.normalize(), "f")


def round_price(symbol_info: dict[str, Any], price: float) -> str:
    tick = _filter_value(symbol_info, "PRICE_FILTER", "tickSize")
    rounded = Decimal(str(price)).quantize(tick, rounding=ROUND_DOWN)
    return format(rounded.normalize(), "f")
