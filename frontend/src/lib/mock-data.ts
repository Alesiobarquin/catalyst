// Realistic mock data matching the exact DB schema from docs/schemas.md
// This is the single source of truth until api.ts switches to real FastAPI calls.

import type { TradeOrder, ValidatedSignal, OrderStats, PriceBar } from "@/types";

export const MOCK_ORDERS: TradeOrder[] = [
  {
    id: 1,
    ticker: "NVDA",
    timestamp_utc: "2026-03-28T14:35:05Z",
    action: "BUY",
    strategy_used: "Supernova",
    recommended_size_usd: 12400,
    limit_price: 105.50,
    stop_loss: 98.00,
    target_price: 125.00,
    rationale: "High short interest (31.4%) combined with insider purchase of $2.1M signals forced covering. Gemini identified active squeeze catalyst with options flow confirming bullish pressure. Regime clear (VIX 17.8).",
    conviction_score: 92,
    catalyst_type: "SUPERNOVA",
    regime_vix: 17.8,
    spy_above_200sma: true,
    current_price: 121.40,
    status: "ACTIVE",
    pnl_pct: 15.1,
  },
  {
    id: 2,
    ticker: "MRNA",
    timestamp_utc: "2026-03-27T09:12:00Z",
    action: "BUY",
    strategy_used: "Scalper",
    recommended_size_usd: 7800,
    limit_price: 62.80,
    stop_loss: 59.66,
    target_price: 72.22,
    rationale: "PDUFA date for mRNA-1283 bivalent booster approved by FDA. Phase 3 data shows 94% efficacy. Binary event with high probability outcome. Biotech hunter + options sweep confluence.",
    conviction_score: 78,
    catalyst_type: "SCALPER",
    regime_vix: 28.3,
    spy_above_200sma: true,
    current_price: 72.22,
    status: "HIT_TARGET",
    pnl_pct: 15.0,
  },
  {
    id: 3,
    ticker: "GME",
    timestamp_utc: "2026-03-26T11:47:22Z",
    action: "BUY",
    strategy_used: "Supernova",
    recommended_size_usd: 4200,
    limit_price: 22.15,
    stop_loss: 20.60,
    target_price: 26.58,
    rationale: "Short float exceeds 28% with days-to-cover of 6.2. Meme catalyst detected via Reddit sentiment tagging. Squeeze profile matches prior episodes. Entry on first intraday breakout.",
    conviction_score: 67,
    catalyst_type: "SUPERNOVA",
    regime_vix: 19.2,
    spy_above_200sma: true,
    current_price: 20.15,
    status: "HIT_STOP",
    pnl_pct: -9.1,
  },
  {
    id: 4,
    ticker: "TSLA",
    timestamp_utc: "2026-03-25T13:22:10Z",
    action: "BUY",
    strategy_used: "Follower",
    recommended_size_usd: 9600,
    limit_price: 178.90,
    stop_loss: 166.38,
    target_price: 203.95,
    rationale: "Strong earnings beat (+28% EPS surprise) combined with delivery record. SPY above 200 SMA, VIX calm. Momentum continuation setup post-gap. Follower strategy: trailing Chandelier exit.",
    conviction_score: 83,
    catalyst_type: "FOLLOWER",
    regime_vix: 16.5,
    spy_above_200sma: true,
    current_price: 195.20,
    status: "ACTIVE",
    pnl_pct: 9.1,
  },
  {
    id: 5,
    ticker: "COIN",
    timestamp_utc: "2026-03-24T10:05:44Z",
    action: "BUY",
    strategy_used: "Drifter",
    recommended_size_usd: 5500,
    limit_price: 210.40,
    stop_loss: 195.67,
    target_price: 240.00,
    rationale: "Post-earnings drift detected: EPS beat of 34%, revenue $1.95B vs $1.62B est. High short float creates additional squeeze potential. 3-week drift window expected.",
    conviction_score: 74,
    catalyst_type: "DRIFTER",
    regime_vix: 21.0,
    spy_above_200sma: false,
    current_price: 218.90,
    status: "ACTIVE",
    pnl_pct: 4.0,
  },
  {
    id: 6,
    ticker: "SMCI",
    timestamp_utc: "2026-03-22T15:30:00Z",
    action: "BUY",
    strategy_used: "Supernova",
    recommended_size_usd: 8100,
    limit_price: 44.20,
    stop_loss: 41.11,
    target_price: 53.04,
    rationale: "Short float 42.1%, days-to-cover 8.7. SEC filing resolved, institutional re-entry detected. Highest conviction squeeze since March 2024 episode. Confluence: squeeze + insider buy.",
    conviction_score: 91,
    catalyst_type: "SUPERNOVA",
    regime_vix: 18.6,
    spy_above_200sma: true,
    current_price: 53.04,
    status: "HIT_TARGET",
    pnl_pct: 20.0,
  },
  {
    id: 7,
    ticker: "AMZN",
    timestamp_utc: "2026-03-20T09:45:00Z",
    action: "BUY",
    strategy_used: "Follower",
    recommended_size_usd: 14000,
    limit_price: 195.60,
    stop_loss: 181.91,
    target_price: 222.98,
    rationale: "AWS margin expansion + AI infrastructure spend driving fundamental re-rate. Momentum regime confirmed with relative volume 3.2x average. Follower entry on pullback to VWAP.",
    conviction_score: 88,
    catalyst_type: "FOLLOWER",
    regime_vix: 15.9,
    spy_above_200sma: true,
    current_price: 210.30,
    status: "ACTIVE",
    pnl_pct: 7.5,
  },
  {
    id: 8,
    ticker: "BBAI",
    timestamp_utc: "2026-03-19T11:00:00Z",
    action: "BUY",
    strategy_used: "Supernova",
    recommended_size_usd: 2800,
    limit_price: 3.42,
    stop_loss: 3.18,
    target_price: 4.10,
    rationale: "AI defense contract announcement + 67% short float. Micro-cap squeeze conditions met. Small size due to reduced regime (VIX 32). High conviction despite elevated volatility.",
    conviction_score: 71,
    catalyst_type: "SUPERNOVA",
    regime_vix: 32.1,
    spy_above_200sma: false,
    current_price: 3.18,
    status: "HIT_STOP",
    pnl_pct: -7.0,
  },
  {
    id: 9,
    ticker: "PLTR",
    timestamp_utc: "2026-03-18T13:15:00Z",
    action: "BUY",
    strategy_used: "Follower",
    recommended_size_usd: 11200,
    limit_price: 87.30,
    stop_loss: 81.19,
    target_price: 99.52,
    rationale: "Government contract expansion in European market. Institutional accumulation detected via dark pool prints. Momentum regime confirmed, ADX > 25 on daily chart.",
    conviction_score: 86,
    catalyst_type: "FOLLOWER",
    regime_vix: 17.2,
    spy_above_200sma: true,
    current_price: 98.10,
    status: "ACTIVE",
    pnl_pct: 12.4,
  },
  {
    id: 10,
    ticker: "RXRX",
    timestamp_utc: "2026-03-15T09:30:00Z",
    action: "BUY",
    strategy_used: "Scalper",
    recommended_size_usd: 3200,
    limit_price: 8.65,
    stop_loss: 8.22,
    target_price: 9.95,
    rationale: "NDA submission for RX-112 received FDA Fast Track designation. Phase 3 interim data positive. Binary event setup with tight stop. 60-minute exit if no follow-through.",
    conviction_score: 63,
    catalyst_type: "SCALPER",
    regime_vix: 29.8,
    spy_above_200sma: true,
    current_price: 9.95,
    status: "HIT_TARGET",
    pnl_pct: 15.0,
  },
];

export const MOCK_SIGNALS: ValidatedSignal[] = [
  {
    id: 1,
    ticker: "NVDA",
    timestamp_utc: "2026-03-28T14:34:00Z",
    conviction_score: 92,
    catalyst_type: "SUPERNOVA",
    rationale: "High short interest (31.4%) combined with insider purchase of $2.1M signals forced covering. Short squeeze conditions fully met.",
    is_trap: false,
    confluence_sources: ["squeeze", "insider"],
    suggested_stop: 98.00,
    suggested_target: 125.00,
    key_risks: ["Market-wide correction could suppress squeeze", "Short seller defends position with additional borrows"],
  },
  {
    id: 2,
    ticker: "MRNA",
    timestamp_utc: "2026-03-27T09:10:00Z",
    conviction_score: 78,
    catalyst_type: "SCALPER",
    rationale: "PDUFA date for mRNA-1283 with Phase 3 success. FDA approval probability elevated based on trial data.",
    is_trap: false,
    confluence_sources: ["biotech", "whale"],
    suggested_stop: 59.66,
    suggested_target: 72.22,
    key_risks: ["FDA may request additional data (Complete Response Letter)", "Competing product approval in same week"],
  },
  {
    id: 3,
    ticker: "GME",
    timestamp_utc: "2026-03-26T11:45:00Z",
    conviction_score: 67,
    catalyst_type: "SUPERNOVA",
    rationale: "Classic meme squeeze setup. Short float 28%, but retail catalyst weaker than 2021 episodes.",
    is_trap: false,
    confluence_sources: ["squeeze"],
    key_risks: ["Meme momentum decays rapidly", "No fundamental catalyst underlying squeeze"],
  },
  {
    id: 4,
    ticker: "SPY",
    timestamp_utc: "2026-03-25T10:00:00Z",
    conviction_score: 41,
    catalyst_type: "UNKNOWN",
    rationale: "Index signal with no clear catalyst. Volume spike may be options expiration artifact.",
    is_trap: true,
    confluence_sources: ["squeeze"],
    key_risks: ["No directional edge", "Options pinning effect"],
  },
];

export const MOCK_STATS: OrderStats = {
  total_orders: 10,
  avg_conviction: 79.3,
  hit_target_count: 3,
  hit_stop_count: 2,
  active_count: 5,
  strategy_breakdown: {
    Supernova: 4,
    Scalper: 2,
    Follower: 3,
    Drifter: 1,
    Fallback: 0,
  },
  catalyst_breakdown: {
    SUPERNOVA: 4,
    SCALPER: 2,
    FOLLOWER: 3,
    DRIFTER: 1,
    UNKNOWN: 0,
  },
  daily_volume: [
    { date: "Mar 15", count: 1 },
    { date: "Mar 18", count: 1 },
    { date: "Mar 19", count: 1 },
    { date: "Mar 20", count: 1 },
    { date: "Mar 22", count: 1 },
    { date: "Mar 24", count: 1 },
    { date: "Mar 25", count: 1 },
    { date: "Mar 26", count: 1 },
    { date: "Mar 27", count: 1 },
    { date: "Mar 28", count: 1 },
  ],
  conviction_distribution: [
    { bucket: "60–69", count: 2 },
    { bucket: "70–79", count: 3 },
    { bucket: "80–89", count: 3 },
    { bucket: "90–100", count: 2 },
  ],
};

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
