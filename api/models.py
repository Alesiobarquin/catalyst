from datetime import datetime
from typing import Optional
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
    regime_vix: Optional[float] = None
    spy_above_200sma: Optional[bool] = None
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
    rationale: Optional[str] = None
    is_trap: bool = False
    confluence_sources: list[str] = []
    key_risks: list[str] = []


# ── Price History ─────────────────────────────────────────────────

class PriceBar(BaseModel):
    time: int           # Unix seconds — matches lightweight-charts expectation
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
