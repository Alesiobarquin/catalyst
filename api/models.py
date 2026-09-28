from datetime import datetime

from pydantic import BaseModel

# ── Trade Orders ──────────────────────────────────────────────────


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
    strategy_breakdown: dict[str, int]
    catalyst_breakdown: dict[str, int]
    daily_volume: list[DailyVolume] = []
    conviction_distribution: list[ConvictionBucket] = []


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


# ── Price History ─────────────────────────────────────────────────


class PriceBar(BaseModel):
    time: int  # Unix seconds — matches lightweight-charts expectation
    open: float
    high: float
    low: float
    close: float


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
