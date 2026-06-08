from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Candle:
    open_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: int


@dataclass(frozen=True)
class ChannelSignal:
    should_short: bool
    reason: str
    upper_now: float | None = None
    lower_now: float | None = None
    channel_width: float | None = None
    entry_reference: float | None = None
    take_profit: float | None = None
    stop_loss: float | None = None
    slope_pct_per_candle: float | None = None
