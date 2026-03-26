from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class AssetClass(str, Enum):
    POLYMARKET = "polymarket"
    CRYPTO = "crypto"
    STOCK = "stock"
    COMMODITY = "commodity"
    FOREX = "forex"
    REAL_ESTATE = "real_estate"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EXTREME = "extreme"


class SignalType(str, Enum):
    SLOW_BURN = "slow_burn"
    FAST_CATALYST = "fast_catalyst"
    STRUCTURAL = "structural"


class Asset(BaseModel):
    id: str
    asset_class: AssetClass
    title: str
    description: str = ""
    resolution_rules: str = ""
    market_price: float = 0.0          # 0-100 (probability %) or raw price
    ai_probability: Optional[float] = None   # 0-100
    confidence_low: Optional[float] = None
    confidence_high: Optional[float] = None
    edge: Optional[float] = None        # ai_probability - market_price
    resolution_risk: RiskLevel = RiskLevel.MEDIUM
    signal_type: SignalType = SignalType.SLOW_BURN
    evidence_count: int = 0
    source_url: str = ""
    tags: list[str] = []
    region: str = ""
    sector: str = ""
    last_scored_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        use_enum_values = True


class EvidenceRecord(BaseModel):
    id: str = ""
    asset_id: str
    source: str
    source_url: str = ""
    published_at: Optional[datetime] = None
    claim: str
    topic: str = ""
    direction: str  # "supports_yes" | "supports_no" | "neutral"
    source_quality: float = Field(ge=0, le=1)
    freshness: float = Field(ge=0, le=1)
    independence_cluster: str = ""
    signal_type: str = ""
    decay_speed: str = "medium"  # slow | medium | fast
    raw_text: str = ""
    created_at: Optional[datetime] = None


class PaperTrade(BaseModel):
    id: str = ""
    asset_id: str
    asset_title: str
    asset_class: str
    direction: str           # YES | NO | LONG | SHORT
    amount: float
    entry_price: float       # market price at entry (0-100)
    entry_ai_prob: float     # AI probability at entry
    entry_edge: float
    shares: float = 0.0
    status: str = "open"     # open | closed
    exit_price: Optional[float] = None
    pnl: Optional[float] = None
    opened_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    coach_note: str = ""
