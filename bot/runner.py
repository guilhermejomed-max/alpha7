from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from bot.binance_futures import BinanceFuturesClient, round_price, round_quantity
from bot.config import Settings, load_settings
from bot.strategy import detect_short_breakout


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def build_orders(settings: Settings, last_price: float, take_profit: float, stop_loss: float, symbol_info: dict) -> dict:
    notional = min(settings.position_notional_usdt, settings.max_position_notional_usdt)
    quantity = round_quantity(symbol_info, notional / last_price)
    tp = round_price(symbol_info, take_profit)
    sl = round_price(symbol_info, stop_loss)
    return {
        "entry": {
            "symbol": settings.symbol,
            "side": "SELL",
            "type": "MARKET",
            "quantity": quantity,
        },
        "take_profit": {
            "symbol": settings.symbol,
            "side": "BUY",
            "type": "TAKE_PROFIT_MARKET",
            "stopPrice": tp,
            "closePosition": "true",
            "workingType": "MARK_PRICE",
        },
        "stop_loss": {
            "symbol": settings.symbol,
            "side": "BUY",
            "type": "STOP_MARKET",
            "stopPrice": sl,
            "closePosition": "true",
            "workingType": "MARK_PRICE",
        },
    }


def run_once(settings: Settings) -> int:
    client = BinanceFuturesClient(settings.api_key, settings.api_secret, settings.testnet, settings.recv_window)
    candles = client.klines(settings.symbol, settings.interval, settings.lookback_limit)
    signal = detect_short_breakout(
        candles=candles,
        channel_candles=settings.channel_candles,
        breakout_buffer_pct=settings.breakout_buffer_pct,
        max_uptrend_slope_pct=settings.max_uptrend_slope_pct,
        min_channel_width_pct=settings.min_channel_width_pct,
        max_channel_width_pct=settings.max_channel_width_pct,
        take_profit_multiplier=settings.take_profit_multiplier,
        stop_return_buffer_pct=settings.stop_return_buffer_pct,
    )

    logging.info("Signal: %s", json.dumps(signal.__dict__, ensure_ascii=False, default=str))
    if not signal.should_short:
        return 0

    if not settings.dry_run:
        position_amt = client.position_amt(settings.symbol)
        if abs(position_amt) > 0:
            logging.info("Skipping entry because an open position already exists: %s", position_amt)
            return 0

        orders = client.open_orders(settings.symbol)
        if orders:
            logging.info("Skipping entry because open orders already exist: %s", len(orders))
            return 0

        client.set_leverage(settings.symbol, settings.leverage)

    symbol_info = client.exchange_info(settings.symbol)
    order_plan = build_orders(
        settings,
        last_price=signal.entry_reference or candles[-1].close,
        take_profit=signal.take_profit or 0,
        stop_loss=signal.stop_loss or 0,
        symbol_info=symbol_info,
    )

    event = {
        "time": datetime.now(timezone.utc).isoformat(),
        "mode": "DRY_RUN" if settings.dry_run else "LIVE",
        "demo_only": settings.demo_only,
        "testnet": settings.testnet,
        "symbol": settings.symbol,
        "signal": signal.__dict__,
        "orders": order_plan,
    }
    logging.info("Order plan: %s", json.dumps(event, ensure_ascii=False, default=str))

    if settings.dry_run:
        return 0

    entry_response = client.new_order(**order_plan["entry"])
    logging.info("Entry response: %s", json.dumps(entry_response, ensure_ascii=False))
    tp_response = client.new_order(**order_plan["take_profit"])
    logging.info("Take profit response: %s", json.dumps(tp_response, ensure_ascii=False))
    sl_response = client.new_order(**order_plan["stop_loss"])
    logging.info("Stop loss response: %s", json.dumps(sl_response, ensure_ascii=False))
    return 0


def main() -> int:
    configure_logging()
    settings = load_settings()
    return run_once(settings)


if __name__ == "__main__":
    raise SystemExit(main())
