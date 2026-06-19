import test from "node:test";
import assert from "node:assert/strict";
import { ema, rsi, sma } from "../server/lib/indicators.mjs";

test("SMA calcula a janela corretamente", () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test("EMA preserva tendência crescente", () => {
  const values = ema(Array.from({ length: 30 }, (_, index) => index + 1), 10);
  assert.ok(values.at(-1) > values.at(-5));
});

test("RSI se aproxima de 100 em série estritamente crescente", () => {
  const values = rsi(Array.from({ length: 40 }, (_, index) => index + 1), 14);
  assert.equal(values.at(-1), 100);
});
