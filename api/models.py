from datetime import datetime

from pydantic import BaseModel

# ── Trade Orders ──────────────────────────────────────────────────


# ── Executions (Alpaca Paper Trading) ──────────────────────────────
class TradeExecutionResponse(BaseModel):
    id: int
    trade_order_id: int
    timestamp_utc: datetime
    ticker: str
    alpaca_order_id: str | None = None
    execution_status: str
    filled_avg_price: float | None = None
    error_message: str | None = None


class TradeOrderResponse(BaseModel):
    id: int
    ticker: str
    timestamp_utc: datetime
    action: str
    strategy_used: str
    recommended_size_usd: float
    limit_price: float
    stop_loss: float
    target_price: float
    rationale: str
    conviction_score: int
    catalyst_type: str
    regime_vix: float | None = None
    spy_above_200sma: bool | None = None
    status: str = "ACTIVE"
    resolved_at: datetime | None = None
    resolved_price: float | None = None
    pnl_percent: float | None = None
    execution: TradeExecutionResponse | None = None


class DailyVolume(BaseModel):
    date: str
    count: int


class ConvictionBucket(BaseModel):
    bucket: str
    count: int


class OrderStatsResponse(BaseModel):
    total_orders: int
    avg_conviction: float
    hit_target_count: int
    hit_stop_count: int
    active_count: int
    expired_count: int = 0
    strategy_breakdown: dict[str, int]
    catalyst_breakdown: dict[str, int]
    daily_volume: list[DailyVolume] = []
    conviction_distribution: list[ConvictionBucket] = []
    win_rate_percent: float = 0.0
    realized_pnl_percent: float = 0.0
    total_realized_pnl_usd: float = 0.0
    total_recommended_volume_usd: float = 0.0


# ── Validated Signals ─────────────────────────────────────────────


class ValidatedSignalResponse(BaseModel):
    id: int
    ticker: str
    timestamp_utc: datetime
    conviction_score: int
    catalyst_type: str
    rationale: str | None = None
    is_trap: bool = False
    confluence_sources: list[str] = []
    key_risks: list[str] = []
    suggested_entry_zone: str | None = None
    suggested_stop: str | None = None


class SignalStatsResponse(BaseModel):
    total_signals: int
    avg_conviction: float
    trap_count: int
    clean_count: int
    trap_rate_percent: float
    high_conviction_count: int
    catalyst_breakdown: dict[str, int]



# ── Price History ─────────────────────────────────────────────────


class PriceBar(BaseModel):
    time: int  # Unix seconds — matches lightweight-charts expectation
    open: float
    high: float
    low: float
    close: float


class MarketQuoteResponse(BaseModel):
    ticker: str
    price: float | None = None
    change: float | None = None
    change_percent: float | None = None
    day_high: float | None = None
    day_low: float | None = None
    volume: int | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None
    market_cap: int | None = None


# ── Executions (Alpaca Paper Trading) ──────────────────────────────
class ExecutionSummaryResponse(BaseModel):
    total_executions: int
    filled_count: int
    failed_count: int
    pending_count: int
    fill_rate_percent: float
    total_volume_usd: float


# ── Generic pagination ────────────────────────────────────────────


class PaginatedResponse[T](BaseModel):
    items: list[T]
    total: int
    page: int
    per_page: int


# ── Signal Detail (Analysis Modal) ────────────────────────────────


class ConfluenceFactor(BaseModel):
    source: str
    strength: str  # "HIGH" | "MODERATE" | "LOW"
    data: str


class ConfluenceDetail(BaseModel):
    factors: list[ConfluenceFactor] = []
    summaryText: str = ""


class ThesisDetail(BaseModel):
    primaryCatalyst: str
    bodyParagraphs: list[str] = []
    counterArguments: list[str] = []


class RiskParameter(BaseModel):
    label: str
    value: str
    description: str | None = None


class ExitTrigger(BaseModel):
    priority: int
    condition: str
    action: str


class ScenarioDetail(BaseModel):
    label: str
    value: str
    probability: str
    type: str  # "best" | "base" | "worst"


class RiskDetail(BaseModel):
    parameters: list[RiskParameter] = []
    exitTriggers: list[ExitTrigger] = []
    scenarios: list[ScenarioDetail] = []
    expectedValue: str = "—"


class PipelineTimelineItem(BaseModel):
    stage: str
    timestamp: str
    detail: str


class PipelineDetail(BaseModel):
    signalId: str
    generatedAt: str
    engineVersion: str = "2.1.0-spring-boot"
    timeline: list[PipelineTimelineItem] = []
    rawFactors: dict = {}


class SignalDetailResponse(BaseModel):
    ticker: str
    exchange: str = "NASDAQ"
    sector: str = "Equities"
    action: str = "BUY"
    status: str = "Active"
    strategy: str
    strategyDescription: str
    convictionScore: int
    convictionMax: int = 100
    convictionLabel: str
    entryPrice: float
    stopLoss: float
    targetPrice: float
    currentPrice: float | None = None
    pnlPercent: float | None = None
    riskReward: str
    positionSize: str
    timeHorizon: str
    generatedAt: str
    age: str
    signalId: str
    thesis: ThesisDetail
    confluence: ConfluenceDetail
    risk: RiskDetail
    pipeline: PipelineDetail
