// ── Core domain types ──────────────────────────────────────────────
// These mirror the Pydantic models in api/models.py and the DB schema in docs/schemas.md

export type Strategy = "Supernova" | "Scalper" | "Follower" | "Drifter" | "Fallback";
export type Action = "BUY" | "SELL";
export type Regime = "PASS" | "PASS_BEARISH" | "SCALPER_ONLY" | "HALT";
export type CatalystType = "SUPERNOVA" | "SCALPER" | "FOLLOWER" | "DRIFTER" | "UNKNOWN";
export type TradeStatus = "HIT_TARGET" | "HIT_STOP" | "ACTIVE" | "EXPIRED";

/** GET /executions/me — Alpaca paper status for current user */
export interface TradeExecution {
  id: number;
  trade_order_id: number;
  timestamp_utc: string;
  ticker: string;
  alpaca_order_id?: string | null;
  execution_status: string;
  filled_avg_price?: number | null;
  error_message?: string | null;
}

/** GET /executions/summary — aggregate paper execution stats */
export interface ExecutionSummary {
  total_executions: number;
  filled_count: number;
  failed_count: number;
  pending_count: number;
  fill_rate_percent: number;
  total_volume_usd: number;
}

/** GET /health/pipeline — FastAPI aggregate check for navbar */
export interface PipelineHealth {
  api: string;
  database: string;
  redis?: string;
  engine: string;
  ready?: boolean;
}

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
  resolved_at?: string | null;
  resolved_price?: number | null;
  pnl_percent?: number | null;
  /** Alpaca paper execution for the signed-in user (GET /executions/me) */
  execution?: TradeExecution | null;
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
  suggested_stop?: string | number;
  suggested_target?: number;
  suggested_entry_zone?: string;
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
  win_rate_percent?: number;
  expired_count?: number;
  realized_pnl_percent?: number;
  total_realized_pnl_usd?: number;
  total_recommended_volume_usd?: number;
}

// Aggregate stats for validated signals (GET /signals/stats)
export interface SignalStats {
  total_signals: number;
  avg_conviction: number;
  trap_count: number;
  clean_count: number;
  trap_rate_percent: number;
  high_conviction_count: number;
  catalyst_breakdown: Record<string, number>;
}

export interface MarketQuote {
  ticker: string;
  price?: number | null;
  change?: number | null;
  change_percent?: number | null;
  day_high?: number | null;
  day_low?: number | null;
  volume?: number | null;
  fifty_two_week_high?: number | null;
  fifty_two_week_low?: number | null;
  market_cap?: number | null;
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

// ── Signal Detail Panel ────────────────────────────────────────────
// Prop shape for <SignalDetailPanel signal={...} />
// All content is rendered from this object; the component contains no
// ticker-specific strings. Missing fields render as "—" via safe().
export interface SignalDetail {
  // Header
  ticker: string;
  exchange: string;
  sector: string;
  action: "BUY" | "SELL";
  status: "Active" | "Target hit" | "Stopped" | "Expired";
  strategy: string;
  strategyDescription: string;
  convictionScore: number;
  convictionMax: number;
  convictionLabel: string;

  // Prices
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  currentPrice: number | null;
  pnlPercent: number | null;

  // Metadata
  riskReward: string;
  positionSize: string;
  timeHorizon: string;
  generatedAt: string;
  age: string;
  signalId: string;

  // Thesis section
  thesis: {
    primaryCatalyst: string;
    bodyParagraphs: string[];
    counterArguments: string[];
  };

  // Confluence section
  confluence: {
    factors: Array<{
      source: string;
      strength: "HIGH" | "MODERATE" | "LOW";
      data: string;
    }>;
    summaryText: string;
  };

  // Risk management section
  risk: {
    parameters: Array<{
      label: string;
      value: string;
      description?: string;
    }>;
    exitTriggers: Array<{
      priority: number;
      condition: string;
      action: string;
    }>;
    scenarios: Array<{
      label: string;
      value: string;
      probability: string;
      type: "best" | "base" | "worst";
    }>;
    expectedValue: string;
  };

  // Pipeline / debug section
  pipeline: {
    signalId: string;
    generatedAt: string;
    engineVersion: string;
    timeline: Array<{
      stage: string;
      timestamp: string;
      detail: string;
    }>;
    rawFactors: object;
  };
}
