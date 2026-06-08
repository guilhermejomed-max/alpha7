import unittest

from bot.models import Candle
from bot.strategy import detect_short_breakout


def candle(i: int, open_: float, high: float, low: float, close: float) -> Candle:
    return Candle(i, open_, high, low, close, 1000, i + 1)


class StrategyTests(unittest.TestCase):
    def test_detects_downside_breakout_from_sideways_channel(self) -> None:
        candles = []
        for i in range(40):
            candles.append(candle(i, 100, 102, 98, 100 + ((i % 3) - 1) * 0.2))
        candles.append(candle(41, 99, 99, 95, 96.5))

        signal = detect_short_breakout(
            candles,
            channel_candles=40,
            breakout_buffer_pct=0.001,
            max_uptrend_slope_pct=0.00025,
            min_channel_width_pct=0.002,
            max_channel_width_pct=0.08,
            take_profit_multiplier=1.0,
            stop_return_buffer_pct=0.0005,
        )

        self.assertTrue(signal.should_short)
        self.assertIsNotNone(signal.take_profit)
        self.assertIsNotNone(signal.stop_loss)
        self.assertLess(signal.take_profit, signal.lower_now)
        self.assertGreater(signal.stop_loss, signal.lower_now)

    def test_rejects_uptrend_channel(self) -> None:
        candles = []
        for i in range(40):
            base = 100 + i * 0.2
            candles.append(candle(i, base, base + 2, base - 2, base))
        candles.append(candle(41, 105, 105, 103, 103))

        signal = detect_short_breakout(
            candles,
            channel_candles=40,
            breakout_buffer_pct=0.001,
            max_uptrend_slope_pct=0.00025,
            min_channel_width_pct=0.002,
            max_channel_width_pct=0.08,
            take_profit_multiplier=1.0,
            stop_return_buffer_pct=0.0005,
        )

        self.assertFalse(signal.should_short)
        self.assertIn("rising", signal.reason)


if __name__ == "__main__":
    unittest.main()
