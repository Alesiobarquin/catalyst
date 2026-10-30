// Synthetic chart bars for local runs without price history; the chart labels them as synthetic.

import type { TradeOrder, PriceBar } from "@/types";

// Generate synthetic price bars for a ticker relative to a trade's timestamp
// Produces ~60 trading days of daily OHLC ending today
export function generateMockPriceBars(order: TradeOrder): PriceBar[] {
  const bars: PriceBar[] = [];
  const signalDate = new Date(order.timestamp_utc);
  const base  = order.limit_price * 0.92; // start slightly below entry
  const now   = new Date();
  const days  = Math.ceil((now.getTime() - signalDate.getTime()) / 86_400_000);
  const totalBars = Math.max(days + 10, 20); // at least 20 bars

  let price = base;
  const startDate = new Date(signalDate);
  startDate.setDate(startDate.getDate() - Math.max(0, 10 - days));

  for (let i = 0; i < totalBars; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends

    const isAfterSignal = d >= signalDate;
    const drift = isAfterSignal
      ? (order.status === "HIT_STOP" ? -0.004 : 0.006) // drift toward outcome
      : 0.001;

    const change = price * (drift + (Math.random() - 0.48) * 0.025);
    const open  = price;
    const close = Math.max(price + change, 0.5);
    const high  = Math.max(open, close) * (1 + Math.random() * 0.012);
    const low   = Math.min(open, close) * (1 - Math.random() * 0.012);

    bars.push({
      time: Math.floor(d.getTime() / 1000),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low:  parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    });
    price = close;
  }
  return bars;
}
