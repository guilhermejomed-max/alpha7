from __future__ import annotations

import os
from dataclasses import dataclass


def load_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as file:
        for raw_line in file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "sim"}


def _int(name: str, default: int) -> int:
    value = os.getenv(name)
    return default if value is None or value == "" else int(value)


def _float(name: str, default: float) -> float:
    value = os.getenv(name)
    return default if value is None or value == "" else float(value)


@dataclass(frozen=True)
class Settings:
    api_key: str
    api_secret: str
    dry_run: bool
    demo_only: bool
    testnet: bool
    symbol: str
    interval: str
    lookback_limit: int
    channel_candles: int
    breakout_buffer_pct: float
    max_uptrend_slope_pct: float
    min_channel_width_pct: float
    max_channel_width_pct: float
    take_profit_multiplier: float
    stop_return_buffer_pct: float
    leverage: int
    position_notional_usdt: float
    max_position_notional_usdt: float
    recv_window: int


def load_settings() -> Settings:
    load_dotenv()
    settings = Settings(
        api_key=os.getenv("BINANCE_API_KEY", ""),
        api_secret=os.getenv("BINANCE_API_SECRET", ""),
        dry_run=_bool("DRY_RUN", True),
        demo_only=_bool("DEMO_ONLY", True),
        testnet=_bool("BINANCE_TESTNET", True),
        symbol=os.getenv("SYMBOL", "BTCUSDT").upper(),
        interval=os.getenv("INTERVAL", "1m"),
        lookback_limit=_int("LOOKBACK_LIMIT", 120),
        channel_candles=_int("CHANNEL_CANDLES", 40),
        breakout_buffer_pct=_float("BREAKOUT_BUFFER_PCT", 0.001),
        max_uptrend_slope_pct=_float("MAX_UPTREND_SLOPE_PCT", 0.00025),
        min_channel_width_pct=_float("MIN_CHANNEL_WIDTH_PCT", 0.002),
        max_channel_width_pct=_float("MAX_CHANNEL_WIDTH_PCT", 0.08),
        take_profit_multiplier=_float("TAKE_PROFIT_MULTIPLIER", 1.0),
        stop_return_buffer_pct=_float("STOP_RETURN_BUFFER_PCT", 0.0005),
        leverage=_int("LEVERAGE", 2),
        position_notional_usdt=_float("POSITION_NOTIONAL_USDT", 20),
        max_position_notional_usdt=_float("MAX_POSITION_NOTIONAL_USDT", 50),
        recv_window=_int("RECV_WINDOW", 5000),
    )

    if settings.demo_only and not settings.testnet:
        raise RuntimeError("DEMO_ONLY=true requires BINANCE_TESTNET=true. Refusing to run against the real market.")

    return settings
