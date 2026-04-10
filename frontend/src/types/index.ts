// ── Core domain types ──────────────────────────────────────────────
// These mirror the Pydantic models in api/models.py and the DB schema in docs/schemas.md

export type Strategy = "Supernova" | "Scalper" | "Follower" | "Drifter" | "Fallback";
export type Action = "BUY" | "SELL";
export type Regime = "PASS" | "PASS_BEARISH" | "SCALPER_ONLY" | "HALT";
export type CatalystType = "SUPERNOVA" | "SCALPER" | "FOLLOWER" | "DRIFTER" | "UNKNOWN";
export type TradeStatus = "HIT_TARGET" | "HIT_STOP" | "ACTIVE" | "EXPIRED";

// Matches trade_orders table + Kafka payload from engine/
export interface TradeOrder {
  id: number;
  ticker: string;
  timestamp_utc: string;          // ISO 8601
  action: Action;
  strategy_used: Strategy;
  recommended_size_usd: number;
  limit_price: number;
  stop_loss: number;
  target_price: number;
  rationale: string;
  conviction_score: number;       // 0–100
  catalyst_type: CatalystType;
  regime_vix: number;
  spy_above_200sma: boolean;
  // Computed client-side from latest price fetch
  current_price?: number;
  status?: TradeStatus;
  pnl_pct?: number;
}

// Matches validated_signals table — raw Gemini output before strategy routing
export interface ValidatedSignal {
  id: number;
  ticker: string;
  timestamp_utc: string;
  conviction_score: number;
  catalyst_type: CatalystType;
  rationale: string;
  is_trap: boolean;
  confluence_sources: string[];
  suggested_stop?: number;
  suggested_target?: number;
  key_risks: string[];
}

// Price bar for TradingView Lightweight Charts
export interface PriceBar {
  time: number;   // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
}

// API paginated response wrapper
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

// Aggregate stats for the stats bar
export interface OrderStats {
  total_orders: number;
  avg_conviction: number;
  hit_target_count: number;
  hit_stop_count: number;
  active_count: number;
  strategy_breakdown: Record<Strategy, number>;
  catalyst_breakdown: Record<CatalystType, number>;
  daily_volume: Array<{ date: string; count: number }>;
  conviction_distribution: Array<{ bucket: string; count: number }>;
}

export interface SignalStats {
  total_signals: number;
  avg_conviction: number;
  trap_count: number;
  catalyst_breakdown: Record<CatalystType, number>;
}

// Response shape from GET /performance/batch
export interface BatchPerformance {
  order_id: number;
  ticker: string;
  current_price: number | null;
  pnl_pct: number | null;
  status: TradeStatus;
  days_held: number;
}
