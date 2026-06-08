from __future__ import annotations

from statistics import fmean

from bot.models import Candle, ChannelSignal


def linear_regression(values: list[float]) -> tuple[float, float]:
    n = len(values)
    if n < 2:
        raise ValueError("At least two values are required")

    xs = list(range(n))
    mean_x = fmean(xs)
    mean_y = fmean(values)
    denominator = sum((x - mean_x) ** 2 for x in xs)
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, values)) / denominator
    intercept = mean_y - slope * mean_x
    return slope, intercept


def detect_short_breakout(
    candles: list[Candle],
    channel_candles: int,
    breakout_buffer_pct: float,
    max_uptrend_slope_pct: float,
    min_channel_width_pct: float,
    max_channel_width_pct: float,
    take_profit_multiplier: float,
    stop_return_buffer_pct: float,
) -> ChannelSignal:
    if len(candles) < channel_candles + 1:
        return ChannelSignal(False, "Not enough closed candles to build the channel")

    channel = candles[-channel_candles - 1 : -1]
    breakout = candles[-1]
    closes = [c.close for c in channel]
    highs = [c.high for c in channel]
    lows = [c.low for c in channel]

    close_slope, close_intercept = linear_regression(closes)
    base_at_now = close_intercept + close_slope * len(channel)

    residual_highs = [h - (close_intercept + close_slope * i) for i, h in enumerate(highs)]
    residual_lows = [l - (close_intercept + close_slope * i) for i, l in enumerate(lows)]
    upper_offset = max(residual_highs)
    lower_offset = min(residual_lows)

    upper_now = base_at_now + upper_offset
    lower_now = base_at_now + lower_offset
    width = upper_now - lower_now
    mid_price = (upper_now + lower_now) / 2

    if mid_price <= 0 or width <= 0:
        return ChannelSignal(False, "Invalid channel geometry")

    slope_pct = close_slope / mid_price
    width_pct = width / mid_price

    if slope_pct > max_uptrend_slope_pct:
        return ChannelSignal(
            False,
            "Channel is rising more than allowed",
            upper_now,
            lower_now,
            width,
            breakout.close,
            slope_pct_per_candle=slope_pct,
        )

    if width_pct < min_channel_width_pct:
        return ChannelSignal(
            False,
            "Channel is too narrow",
            upper_now,
            lower_now,
            width,
            breakout.close,
            slope_pct_per_candle=slope_pct,
        )

    if width_pct > max_channel_width_pct:
        return ChannelSignal(
            False,
            "Channel is too wide",
            upper_now,
            lower_now,
            width,
            breakout.close,
            slope_pct_per_candle=slope_pct,
        )

    trigger = lower_now * (1 - breakout_buffer_pct)
    if breakout.close >= trigger:
        return ChannelSignal(
            False,
            "No confirmed downside breakout",
            upper_now,
            lower_now,
            width,
            breakout.close,
            slope_pct_per_candle=slope_pct,
        )

    take_profit = lower_now - (width * take_profit_multiplier)
    stop_loss = lower_now * (1 + stop_return_buffer_pct)

    return ChannelSignal(
        True,
        "Confirmed downside breakout",
        upper_now,
        lower_now,
        width,
        breakout.close,
        take_profit,
        stop_loss,
        slope_pct,
    )
