from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class RecommendationType(str, Enum):
    TRADE = "trade"
    WATCH = "watch"
    AVOID = "avoid"


class UrgencyLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Recommendation(BaseModel):
    id: str
    type: RecommendationType
    urgency: UrgencyLevel
    title: str
    asset_id: str = ""
    asset_title: str = ""
    asset_class: str = ""
    sector: str = ""
    region: str = ""
    direction: str = "WATCH"          # LONG | SHORT | YES | NO | WATCH
    ai_probability: Optional[float] = None
    market_price: Optional[float] = None
    edge: Optional[float] = None
    headline: str = ""
    why: list[str] = []
    historical_context: str = ""
    bear_case: str = ""
    entry_trigger: str = ""
    confidence: int = Field(ge=0, le=100, default=60)
    window: str = ""
    urgency_reason: str = ""
    sources: list[str] = []
    briefing_id: str = ""
    created_at: Optional[datetime] = None

    class Config:
        use_enum_values = True


class GlobalEvent(BaseModel):
    id: str = ""
    title: str
    region: str
    impact_level: str                  # critical | high | medium | low
    detail: str
    affected_assets: list[str] = []
    direction: str = "mixed"           # bullish | bearish | mixed
    time_context: str = ""
    scanned_at: Optional[datetime] = None


class DailyBriefing(BaseModel):
    id: str
    generated_at: datetime
    summary: str = ""
    recommendations: list[Recommendation] = []
    global_events: list[dict] = []
    trade_count: int = 0
    watch_count: int = 0
    signals_processed: int = 0
    scan_number: int = 1

    class Config:
        use_enum_values = True


class WatchlistItem(BaseModel):
    id: str = ""
    user_id: str = "default"
    asset_id: str
    asset_title: str
    asset_class: str
    alert_edge_threshold: float = 5.0
    notes: str = ""
    added_at: Optional[datetime] = None
