#!/bin/bash
# ============================================================
#  Alpha Lens — Update Installer
#  Run this from your Replit Shell with: bash install_updates.sh
#  This adds the Recommendations Engine (E6) and Live Trading
#  Engines (E7) to your existing Alpha Lens installation.
# ============================================================

set -e

echo ""
echo "============================================"
echo "  Alpha Lens — Installing Updates"
echo "  E6: Proactive Recommendations Engine"
echo "  E7: Live Trading (Polymarket, Kalshi, Alpaca)"
echo "============================================"
echo ""

# ── Check we're in the right place ──────────────────────────
if [ ! -f "backend/main.py" ]; then
  echo "ERROR: Run this from your Replit root directory."
  echo "       Make sure backend/main.py exists first."
  exit 1
fi

echo "[1/8] Creating new model files..."

# ── Live trading models ──────────────────────────────────────
cat > backend/models/live_trading.py << 'PYEOF'
from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from enum import Enum

class Platform(str, Enum):
    POLYMARKET = "polymarket"
    KALSHI = "kalshi"
    ALPACA = "alpaca"
    COINBASE = "coinbase"
    PAPER = "paper"

class OrderSide(str, Enum):
    YES = "YES"
    NO = "NO"
    LONG = "LONG"
    SHORT = "SHORT"
    BUY = "BUY"
    SELL = "SELL"

class OrderType(str, Enum):
    LIMIT = "LIMIT"
    MARKET = "MARKET"
    GTC = "GTC"
    GTD = "GTD"
    FOK = "FOK"
    FAK = "FAK"

class OrderStatus(str, Enum):
    PENDING = "pending"
    OPEN = "open"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    EXPIRED = "expired"

class LiveOrder(BaseModel):
    asset_id: str
    platform: Platform
    side: OrderSide
    order_type: OrderType = OrderType.GTC
    amount_usd: float = 0.0
    amount_usdc: float = 0.0
    ticker: str = ""
    token_id: str = ""
    limit_price: Optional[float] = None
    quantity: Optional[float] = None
    expiry: Optional[datetime] = None
    recommendation_id: str = ""
    ai_probability: float = 0.0
    ai_edge: float = 0.0
    confidence: int = 0

class TradeResult(BaseModel):
    success: bool
    platform: Platform
    order_id: str = ""
    asset_id: str = ""
    direction: str = ""
    amount: float = 0.0
    price: float = 0.0
    size: float = 0.0
    status: OrderStatus = OrderStatus.PENDING
    error: str = ""
    paper_mode: bool = False
    raw_response: Optional[Any] = None
    executed_at: Optional[datetime] = None

class LivePosition(BaseModel):
    id: str = ""
    platform: Platform
    asset_id: str
    asset_title: str = ""
    direction: str
    size: float
    entry_price: float
    current_price: float = 0.0
    unrealized_pnl: float = 0.0
    cost_basis: float = 0.0
    paper_mode: bool = False
    opened_at: Optional[datetime] = None

class PortfolioSnapshot(BaseModel):
    total_value_usd: float = 0.0
    total_pnl_usd: float = 0.0
    cash_available: float = 0.0
    platforms: dict = {}
    open_positions: list = []
    timestamp: datetime = datetime.utcnow()
PYEOF

# ── Recommendations models ───────────────────────────────────
cat > backend/models/recommendations.py << 'PYEOF'
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
    direction: str = "WATCH"
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
    outcome: str = ""
    created_at: Optional[datetime] = None
    class Config:
        use_enum_values = True

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
PYEOF

echo "[2/8] Creating recommendations engine (E6)..."

cat > backend/engines/recommendations.py << 'PYEOF'
"""
E6: Proactive Recommendations Engine
Runs every 30 minutes. Scans global markets and surfaces
"Hey! Check out these potential trades!" opportunities.
"""
import anthropic
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from backend.models.recommendations import Recommendation, RecommendationType, UrgencyLevel, DailyBriefing
from backend.db.database import get_db, get_cache
from backend.config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

AGENT_SYSTEM_PROMPT = """You are the Alpha Lens proactive trading intelligence agent.

Scan a list of scored assets and identify the BEST opportunities:
1. TRADE CALL - clear edge, strong evidence, act now
2. WATCH - developing setup, wait for confirmation trigger
3. AVOID - risk elevated, evidence against a position

For EACH recommendation provide:
- A punchy headline (max 12 words) like a tip from a sharp trader
- Why flagged (3-5 specific signal bullets, not generic)
- Historical context: what happened in similar past setups (cite year + outcome)
- Entry trigger (for WATCH) or action (for TRADE)
- Confidence score 0-100
- Execution window
- Urgency: high (act today) | medium (this week) | low (developing)
- Bear case: what could make this wrong

RULES:
- Only flag assets where |edge| >= 5 points AND evidence_count >= 3
- Max 3 TRADE CALLS per briefing
- Max 8 WATCHES per briefing
- Always cite specific historical analog with year
- Never force a recommendation if no strong opportunity exists

Return JSON array only. Each object:
{
  "type": "trade|watch|avoid",
  "urgency": "high|medium|low",
  "title": "Short punchy headline",
  "direction": "LONG|SHORT|YES|NO|WATCH",
  "headline": "2-3 sentence explanation",
  "why": ["signal 1", "signal 2", "signal 3"],
  "historical_context": "Specific analog with year and outcome",
  "bear_case": "What could make this wrong",
  "entry_trigger": "Specific price/event that confirms trade (for WATCH)",
  "confidence": 75,
  "window": "2-3 weeks",
  "urgency_reason": "Why this urgency level"
}

Return ONLY valid JSON array. No markdown."""

EVENTS_PROMPT = """You are a global market intelligence analyst.

Search for the TOP 5-8 market-moving events happening RIGHT NOW globally.
For each event identify what happened, which assets are affected, and urgency.

Return JSON array:
[{
  "title": "Event headline (max 10 words)",
  "region": "Middle East|Asia-Pacific|Europe|Americas|Africa|Global",
  "impact_level": "critical|high|medium|low",
  "detail": "2-3 sentences with specific data",
  "affected_assets": ["Brent Crude", "LNG Freight"],
  "direction": "bullish|bearish|mixed",
  "time_context": "Breaking|Today|This week|Developing"
}]

Only real current events. Return ONLY valid JSON."""

SUMMARY_PROMPT = """You are the Alpha Lens morning briefing writer.
Write a 3-4 sentence executive summary of today's top recommendations.
Sound like a sharp trading desk morning note. Be specific about assets and edge sizes.
Return plain text only. 3-4 sentences max."""


async def scan_for_recommendations() -> DailyBriefing:
    """Main agent loop — runs every 30 minutes."""
    print("-> E6: Proactive agent scanning for recommendations...")
    now = datetime.utcnow()

    cache = get_cache()
    cache_key = "daily_briefing:current"
    if cache:
        try:
            cached = cache.get(cache_key)
            if cached:
                data = json.loads(cached)
                briefing = DailyBriefing(**data)
                age = (now - briefing.generated_at).total_seconds()
                if age < 1800:
                    print(f"✓ E6: Returning cached briefing ({int(age/60)}min old)")
                    return briefing
        except Exception:
            pass

    assets = await get_scored_assets()
    events = await scan_global_events()
    recs = await generate_recommendations(assets, events)
    summary = await generate_briefing_summary(recs)
    scan_num = await get_scan_number()

    briefing = DailyBriefing(
        id=hashlib.md5(now.isoformat().encode()).hexdigest()[:8],
        generated_at=now,
        summary=summary,
        recommendations=recs,
        global_events=events,
        trade_count=sum(1 for r in recs if r.type == RecommendationType.TRADE),
        watch_count=sum(1 for r in recs if r.type == RecommendationType.WATCH),
        signals_processed=len(assets) * 5,
        scan_number=scan_num,
    )

    await store_briefing(briefing)
    if cache:
        try:
            cache.set(cache_key, briefing.model_dump_json(), ex=1800)
        except Exception:
            pass

    print(f"✓ E6: Generated briefing — {briefing.trade_count} trades, {briefing.watch_count} watches")
    return briefing


async def get_scored_assets(limit: int = 50) -> list[dict]:
    try:
        db = get_db()
        cutoff = (datetime.utcnow() - timedelta(hours=4)).isoformat()
        result = db.table("assets").select("*")\
            .gte("last_scored_at", cutoff)\
            .gte("evidence_count", 3)\
            .order("evidence_count", desc=True)\
            .limit(limit).execute()
        return result.data
    except Exception as e:
        print(f"⚠ E6 get_scored_assets: {e}")
        return []


async def scan_global_events() -> list[dict]:
    if not settings.anthropic_api_key:
        return []
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=EVENTS_PROMPT,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=[{"role": "user", "content":
                f"Today is {datetime.utcnow().strftime('%B %d, %Y')}. "
                "What are the top 6 market-moving events right now globally? "
                "Focus on energy, geopolitics, central bank signals, commodity supply."}]
        )
        for block in response.content:
            if block.type == "text" and block.text.strip():
                raw = block.text.strip().lstrip("```json").lstrip("```").rstrip("```")
                events = json.loads(raw)
                await store_events(events)
                return events
    except Exception as e:
        print(f"⚠ E6 scan_global_events: {e}")
    return []


async def generate_recommendations(assets: list[dict], events: list[dict]) -> list[Recommendation]:
    if not assets:
        return []
    asset_summary = "\n".join([
        f"- {a.get('title','')[:60]} | class={a.get('asset_class')} | "
        f"AI={a.get('ai_probability','N/A')}% | Mkt={a.get('market_price','N/A')}% | "
        f"Edge={a.get('edge','N/A')} pts | Evidence={a.get('evidence_count',0)}"
        for a in assets[:30]
    ])
    event_summary = "\n".join([
        f"- [{e.get('region')}] {e.get('title')} — "
        f"Impact: {e.get('impact_level')} — Affects: {', '.join(e.get('affected_assets',[]))}"
        for e in events[:6]
    ])
    prompt = (f"Today is {datetime.utcnow().strftime('%A, %B %d, %Y')}.\n\n"
              f"SCORED ASSETS:\n{asset_summary or 'None available yet'}\n\n"
              f"GLOBAL EVENTS:\n{event_summary or 'None available yet'}\n\n"
              "Identify best trade calls and watches. Cross-reference assets with events.")
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=3000,
            system=AGENT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}]
        )
        for block in response.content:
            if block.type == "text" and block.text.strip():
                raw = block.text.strip().lstrip("```json").lstrip("```").rstrip("```")
                raw_recs = json.loads(raw)
                recs = []
                for i, r in enumerate(raw_recs):
                    asset_data = assets[i] if i < len(assets) else {}
                    rec = Recommendation(
                        id=hashlib.md5(f"{r.get('title')}{datetime.utcnow().isoformat()}".encode()).hexdigest()[:10],
                        type=RecommendationType(r.get("type", "watch")),
                        urgency=UrgencyLevel(r.get("urgency", "medium")),
                        title=r.get("title", ""),
                        asset_id=asset_data.get("id", ""),
                        asset_title=asset_data.get("title", r.get("title", "")),
                        asset_class=asset_data.get("asset_class", ""),
                        sector=asset_data.get("sector", ""),
                        region=asset_data.get("region", ""),
                        direction=r.get("direction", "WATCH"),
                        ai_probability=asset_data.get("ai_probability"),
                        market_price=asset_data.get("market_price"),
                        edge=asset_data.get("edge"),
                        headline=r.get("headline", ""),
                        why=r.get("why", []),
                        historical_context=r.get("historical_context", ""),
                        bear_case=r.get("bear_case", ""),
                        entry_trigger=r.get("entry_trigger", ""),
                        confidence=r.get("confidence", 60),
                        window=r.get("window", ""),
                        urgency_reason=r.get("urgency_reason", ""),
                        created_at=datetime.utcnow(),
                    )
                    recs.append(rec)
                return recs
    except Exception as e:
        print(f"⚠ E6 generate_recommendations: {e}")
    return []


async def generate_briefing_summary(recs: list[Recommendation]) -> str:
    if not recs:
        return "No significant opportunities identified in this scan. Markets appear fairly priced."
    try:
        rec_text = "\n".join([
            f"- [{r.type.value.upper()}] {r.title} | Edge: {r.edge} pts | Confidence: {r.confidence}%"
            for r in recs[:5]
        ])
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            system=SUMMARY_PROMPT,
            messages=[{"role": "user", "content": f"Today's recommendations:\n{rec_text}"}]
        )
        for block in response.content:
            if block.type == "text":
                return block.text.strip()
    except Exception as e:
        print(f"⚠ E6 summary: {e}")
    top = recs[0]
    return (f"Today's scan identified {len(recs)} opportunities. "
            f"Top call: {top.title} with {top.edge or 0:+.0f}pt edge at {top.confidence}% confidence.")


async def store_briefing(briefing: DailyBriefing):
    try:
        db = get_db()
        db.table("daily_briefings").upsert({
            "id": briefing.id,
            "generated_at": briefing.generated_at.isoformat(),
            "summary": briefing.summary,
            "trade_count": briefing.trade_count,
            "watch_count": briefing.watch_count,
            "signals_processed": briefing.signals_processed,
            "scan_number": briefing.scan_number,
        }, on_conflict="id").execute()
        for rec in briefing.recommendations:
            data = rec.model_dump(exclude_none=True)
            for k in ["created_at"]:
                if k in data and data[k]:
                    data[k] = data[k].isoformat() if hasattr(data[k], "isoformat") else str(data[k])
            data["briefing_id"] = briefing.id
            data["type"] = data["type"] if isinstance(data["type"], str) else data["type"].value
            data["urgency"] = data["urgency"] if isinstance(data["urgency"], str) else data["urgency"].value
            db.table("recommendations").upsert(data, on_conflict="id").execute()
    except Exception as e:
        print(f"⚠ E6 store_briefing: {e}")


async def store_events(events: list[dict]):
    try:
        db = get_db()
        for event in events:
            event["scanned_at"] = datetime.utcnow().isoformat()
            event["id"] = hashlib.md5(f"{event.get('title','')}{event.get('scanned_at','')}".encode()).hexdigest()[:12]
            db.table("global_events").upsert(event, on_conflict="id").execute()
    except Exception as e:
        print(f"⚠ E6 store_events: {e}")


async def get_scan_number() -> int:
    try:
        db = get_db()
        result = db.table("daily_briefings").select("id", count="exact").execute()
        return (result.count or 0) + 1
    except Exception:
        return 1


async def get_current_briefing() -> Optional[DailyBriefing]:
    cache = get_cache()
    if cache:
        try:
            cached = cache.get("daily_briefing:current")
            if cached:
                return DailyBriefing(**json.loads(cached))
        except Exception:
            pass
    try:
        db = get_db()
        result = db.table("daily_briefings").select("*").order("generated_at", desc=True).limit(1).execute()
        if result.data:
            bd = result.data[0]
            recs_result = db.table("recommendations").select("*").eq("briefing_id", bd["id"]).order("confidence", desc=True).execute()
            events_result = db.table("global_events").select("*").order("scanned_at", desc=True).limit(8).execute()
            bd["recommendations"] = [Recommendation(**r) for r in recs_result.data]
            bd["global_events"] = events_result.data
            return DailyBriefing(**bd)
    except Exception as e:
        print(f"⚠ E6 get_current_briefing: {e}")
    return None
PYEOF

echo "[3/8] Creating live trading engines (E7)..."

cat > backend/engines/polymarket_live.py << 'PYEOF'
"""E7a: Polymarket Live Trading Engine — Dominica / non-US jurisdictions"""
import httpx, json, time, hmac, hashlib, base64
from datetime import datetime
from typing import Optional
from backend.config import settings
from backend.models.live_trading import LiveOrder, OrderSide, OrderType, OrderStatus, Platform, TradeResult

CLOB_BASE = "https://clob.polymarket.com"

class PolymarketEngine:
    def __init__(self):
        self.api_key = settings.polymarket_api_key
        self.secret = settings.polymarket_secret
        self.passphrase = settings.polymarket_passphrase
        self._ready = bool(self.api_key and self.secret and self.passphrase)

    @property
    def is_configured(self): return self._ready

    def _headers(self, method, path, body=""):
        ts = str(int(time.time() * 1000))
        msg = ts + method.upper() + path + body
        sig = base64.b64encode(hmac.new(self.secret.encode(), msg.encode(), hashlib.sha256).digest()).decode()
        return {"POLY-API-KEY": self.api_key, "POLY-PASSPHRASE": self.passphrase,
                "POLY-SIGNATURE": sig, "POLY-TIMESTAMP": ts, "Content-Type": "application/json"}

    async def get_balance(self):
        if not self.is_configured:
            return {"error": "Polymarket not configured — add POLYMARKET_API_KEY to Replit Secrets", "balance": 0}
        async with httpx.AsyncClient(timeout=15) as c:
            try:
                r = await c.get(f"{CLOB_BASE}/balance", headers=self._headers("GET", "/balance"))
                r.raise_for_status()
                return {"platform": "polymarket", "balance_usdc": float(r.json().get("balance", 0)), "currency": "USDC"}
            except Exception as e:
                return {"error": str(e), "balance": 0}

    async def place_order(self, order: LiveOrder) -> TradeResult:
        if not self.is_configured:
            return TradeResult(success=False, error="Polymarket not configured", platform=Platform.POLYMARKET)
        price = order.limit_price or 0.5
        size = round((order.amount_usdc or order.amount_usd) / price, 4)
        payload = {"order_type": order.order_type.value if hasattr(order.order_type, 'value') else "GTC",
                   "type": "LIMIT", "side": "BUY", "token_id": order.token_id,
                   "price": str(price), "size": str(size), "funder": settings.polygon_wallet_address or ""}
        body = json.dumps(payload)
        async with httpx.AsyncClient(timeout=20) as c:
            try:
                r = await c.post(f"{CLOB_BASE}/order", content=body, headers=self._headers("POST", "/order", body))
                r.raise_for_status()
                data = r.json()
                return TradeResult(success=True, platform=Platform.POLYMARKET, order_id=data.get("orderID", ""),
                                   asset_id=order.asset_id, direction=order.side.value,
                                   amount=order.amount_usd, price=price, size=size,
                                   status=OrderStatus.OPEN, raw_response=data, executed_at=datetime.utcnow())
            except Exception as e:
                return TradeResult(success=False, error=str(e), platform=Platform.POLYMARKET)

    async def cancel_order(self, order_id):
        path = f"/order/{order_id}"
        async with httpx.AsyncClient(timeout=10) as c:
            try:
                r = await c.delete(f"{CLOB_BASE}{path}", headers=self._headers("DELETE", path))
                return r.status_code in (200, 204)
            except: return False

    async def get_open_orders(self):
        async with httpx.AsyncClient(timeout=10) as c:
            try:
                r = await c.get(f"{CLOB_BASE}/orders", headers=self._headers("GET", "/orders"))
                r.raise_for_status(); return r.json().get("orders", [])
            except: return []

    async def get_positions(self):
        async with httpx.AsyncClient(timeout=10) as c:
            try:
                r = await c.get(f"{CLOB_BASE}/positions", headers=self._headers("GET", "/positions"))
                r.raise_for_status(); return r.json().get("positions", [])
            except: return []

polymarket_engine = PolymarketEngine()
PYEOF

cat > backend/engines/kalshi_live.py << 'PYEOF'
"""E7b: Kalshi Live Trading Engine — CFTC regulated, Philippines + international OK"""
import httpx, json
from datetime import datetime
from typing import Optional
from backend.config import settings
from backend.models.live_trading import LiveOrder, OrderSide, OrderStatus, Platform, TradeResult

KALSHI_BASE = "https://trading-api.kalshi.com/trade-api/v2"

class KalshiEngine:
    def __init__(self):
        self.email = settings.kalshi_email
        self.password = settings.kalshi_password
        self._token = None
        self._ready = bool(self.email and self.password)

    @property
    def is_configured(self): return self._ready

    async def _authenticate(self):
        async with httpx.AsyncClient(timeout=15) as c:
            try:
                r = await c.post(f"{KALSHI_BASE}/login", json={"email": self.email, "password": self.password})
                r.raise_for_status(); self._token = r.json().get("token"); return bool(self._token)
            except Exception as e:
                print(f"⚠ Kalshi auth: {e}"); return False

    async def _headers(self):
        if not self._token: await self._authenticate()
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}

    async def get_balance(self):
        if not self.is_configured:
            return {"error": "Kalshi not configured — add KALSHI_EMAIL and KALSHI_PASSWORD to Replit Secrets", "balance": 0}
        h = await self._headers()
        async with httpx.AsyncClient(timeout=15) as c:
            try:
                r = await c.get(f"{KALSHI_BASE}/portfolio/balance", headers=h)
                r.raise_for_status(); data = r.json()
                return {"platform": "kalshi", "balance_usd": data.get("balance", 0) / 100, "currency": "USD"}
            except Exception as e:
                return {"error": str(e), "balance": 0}

    async def search_markets(self, query="", status="open", limit=20):
        h = await self._headers()
        async with httpx.AsyncClient(timeout=15) as c:
            try:
                params = {"status": status, "limit": limit}
                if query: params["search"] = query
                r = await c.get(f"{KALSHI_BASE}/markets", params=params, headers=h)
                r.raise_for_status(); return r.json().get("markets", [])
            except: return []

    async def place_order(self, order: LiveOrder) -> TradeResult:
        if not self.is_configured:
            return TradeResult(success=False, error="Kalshi not configured", platform=Platform.KALSHI)
        price_cents = int((order.limit_price or 0.5) * 100)
        count = max(1, int((order.amount_usd or 10) / (order.limit_price or 0.5)))
        payload = {"ticker": order.ticker, "action": "buy",
                   "side": "yes" if order.side == OrderSide.YES else "no",
                   "type": "limit",
                   "yes_price": price_cents if order.side == OrderSide.YES else 100 - price_cents,
                   "count": count, "client_order_id": f"al_{int(datetime.utcnow().timestamp())}"}
        h = await self._headers()
        async with httpx.AsyncClient(timeout=20) as c:
            try:
                r = await c.post(f"{KALSHI_BASE}/portfolio/orders", json=payload, headers=h)
                r.raise_for_status(); data = r.json(); od = data.get("order", {})
                return TradeResult(success=True, platform=Platform.KALSHI, order_id=od.get("order_id", ""),
                                   asset_id=order.asset_id, direction=order.side.value,
                                   amount=order.amount_usd, price=order.limit_price or 0.5,
                                   size=count, status=OrderStatus.OPEN, raw_response=data, executed_at=datetime.utcnow())
            except Exception as e:
                return TradeResult(success=False, error=str(e), platform=Platform.KALSHI)

    async def cancel_order(self, order_id):
        h = await self._headers()
        async with httpx.AsyncClient(timeout=10) as c:
            try:
                r = await c.delete(f"{KALSHI_BASE}/portfolio/orders/{order_id}", headers=h)
                return r.status_code in (200, 204)
            except: return False

    async def get_open_orders(self):
        h = await self._headers()
        async with httpx.AsyncClient(timeout=10) as c:
            try:
                r = await c.get(f"{KALSHI_BASE}/portfolio/orders", params={"status": "resting"}, headers=h)
                r.raise_for_status(); return r.json().get("orders", [])
            except: return []

    async def get_positions(self):
        h = await self._headers()
        async with httpx.AsyncClient(timeout=10) as c:
            try:
                r = await c.get(f"{KALSHI_BASE}/portfolio/positions", headers=h)
                r.raise_for_status(); return r.json().get("market_positions", [])
            except: return []

kalshi_engine = KalshiEngine()
PYEOF

cat > backend/engines/alpaca_live.py << 'PYEOF'
"""E7c: Alpaca Markets Live Trading Engine — stocks/ETFs"""
import httpx
from datetime import datetime
from backend.config import settings
from backend.models.live_trading import LiveOrder, OrderSide, OrderType, OrderStatus, Platform, TradeResult

class AlpacaEngine:
    def __init__(self):
        self.api_key = settings.alpaca_api_key
        self.secret = settings.alpaca_secret_key
        self.base_url = settings.alpaca_base_url or "https://paper-api.alpaca.markets"
        self._ready = bool(self.api_key and self.secret)

    @property
    def is_configured(self): return self._ready

    @property
    def is_paper(self): return "paper" in self.base_url

    def _headers(self):
        return {"APCA-API-KEY-ID": self.api_key, "APCA-API-SECRET-KEY": self.secret, "Content-Type": "application/json"}

    async def get_account(self):
        if not self.is_configured:
            return {"error": "Alpaca not configured — add ALPACA_API_KEY and ALPACA_SECRET_KEY to Replit Secrets"}
        async with httpx.AsyncClient(timeout=15) as c:
            try:
                r = await c.get(f"{self.base_url}/v2/account", headers=self._headers())
                r.raise_for_status(); d = r.json()
                return {"platform": "alpaca", "paper_mode": self.is_paper,
                        "buying_power": float(d.get("buying_power", 0)),
                        "portfolio_value": float(d.get("portfolio_value", 0)),
                        "cash": float(d.get("cash", 0)), "currency": "USD", "status": d.get("status")}
            except Exception as e:
                return {"error": str(e)}

    async def place_order(self, order: LiveOrder) -> TradeResult:
        if not self.is_configured:
            return TradeResult(success=False, error="Alpaca not configured", platform=Platform.ALPACA)
        payload = {"symbol": order.ticker,
                   "side": "buy" if order.side in (OrderSide.YES, OrderSide.LONG, OrderSide.BUY) else "sell",
                   "type": "limit" if order.limit_price else "market", "time_in_force": "day"}
        if order.quantity:
            payload["qty"] = str(order.quantity)
        else:
            payload["notional"] = str(round(order.amount_usd, 2))
        if order.limit_price:
            payload["limit_price"] = str(round(order.limit_price, 2))
        if order.order_type == OrderType.GTD:
            payload["time_in_force"] = "gtc"
        elif order.order_type == OrderType.FOK:
            payload["time_in_force"] = "fok"
        async with httpx.AsyncClient(timeout=20) as c:
            try:
                r = await c.post(f"{self.base_url}/v2/orders", json=payload, headers=self._headers())
                r.raise_for_status(); data = r.json()
                return TradeResult(success=True, platform=Platform.ALPACA, order_id=data.get("id", ""),
                                   asset_id=order.asset_id, direction=order.side.value,
                                   amount=order.amount_usd, price=float(data.get("limit_price") or 0),
                                   size=float(data.get("qty") or 0), status=OrderStatus.OPEN,
                                   paper_mode=self.is_paper, raw_response=data, executed_at=datetime.utcnow())
            except Exception as e:
                return TradeResult(success=False, error=str(e), platform=Platform.ALPACA)

    async def cancel_order(self, order_id):
        async with httpx.AsyncClient(timeout=10) as c:
            try:
                r = await c.delete(f"{self.base_url}/v2/orders/{order_id}", headers=self._headers())
                return r.status_code in (200, 204)
            except: return False

    async def get_positions(self):
        async with httpx.AsyncClient(timeout=10) as c:
            try:
                r = await c.get(f"{self.base_url}/v2/positions", headers=self._headers())
                r.raise_for_status(); return r.json()
            except: return []

    async def get_open_orders(self):
        async with httpx.AsyncClient(timeout=10) as c:
            try:
                r = await c.get(f"{self.base_url}/v2/orders", params={"status": "open"}, headers=self._headers())
                r.raise_for_status(); return r.json()
            except: return []

alpaca_engine = AlpacaEngine()
PYEOF

echo "[4/8] Creating platform router..."

cat > backend/engines/platform_router.py << 'PYEOF'
"""E7d: Platform Router + Risk Gate"""
import asyncio
from datetime import datetime
from backend.models.live_trading import LiveOrder, OrderSide, OrderType, Platform, TradeResult, PortfolioSnapshot
from backend.models.recommendations import Recommendation
from backend.engines.polymarket_live import polymarket_engine
from backend.engines.kalshi_live import kalshi_engine
from backend.engines.alpaca_live import alpaca_engine
from backend.db.database import get_db
from backend.config import settings

RISK = {
    "min_edge": float(getattr(settings, "min_edge_to_execute", "5")),
    "min_confidence": int(getattr(settings, "min_confidence", "65")),
    "max_position_pct": float(getattr(settings, "max_position_pct", "0.05")),
    "max_daily_trades": int(getattr(settings, "max_daily_trades", "10")),
    "daily_loss_limit_pct": float(getattr(settings, "daily_loss_limit_pct", "0.10")),
    "require_approval": getattr(settings, "require_approval", "true").lower() == "true",
}

async def check_risk_gate(rec: Recommendation, amount: float, portfolio: PortfolioSnapshot):
    edge = abs(rec.edge or 0)
    if edge < RISK["min_edge"]:
        return False, f"Edge {edge:.1f}pts below minimum {RISK['min_edge']}pts"
    if rec.confidence < RISK["min_confidence"]:
        return False, f"Confidence {rec.confidence}% below minimum {RISK['min_confidence']}%"
    max_amount = portfolio.total_value_usd * RISK["max_position_pct"]
    if amount > max_amount and portfolio.total_value_usd > 0:
        return False, f"${amount:.0f} exceeds max position ${max_amount:.0f}"
    daily_count = await get_daily_trade_count()
    if daily_count >= RISK["max_daily_trades"]:
        return False, f"Daily trade limit ({RISK['max_daily_trades']}) reached"
    return True, "All risk checks passed"

def select_platform(rec: Recommendation) -> Platform:
    asset_class = rec.asset_class or ""
    title = rec.title.lower()
    if asset_class == "polymarket":
        if any(kw in title for kw in ["fed", "cpi", "inflation", "gdp", "unemployment"]):
            if kalshi_engine.is_configured: return Platform.KALSHI
        if polymarket_engine.is_configured: return Platform.POLYMARKET
    elif asset_class in ["stock", "etf"]:
        if alpaca_engine.is_configured: return Platform.ALPACA
    elif asset_class in ["macro", "political"]:
        if kalshi_engine.is_configured: return Platform.KALSHI
        if polymarket_engine.is_configured: return Platform.POLYMARKET
    if polymarket_engine.is_configured: return Platform.POLYMARKET
    if kalshi_engine.is_configured: return Platform.KALSHI
    return Platform.PAPER

async def execute_recommendation(rec: Recommendation, amount_usd: float,
    platform: Platform = None, order_type: OrderType = OrderType.GTC,
    override_approval: bool = False) -> TradeResult:
    portfolio = await get_portfolio_snapshot()
    passed, reason = await check_risk_gate(rec, amount_usd, portfolio)
    if not passed:
        return TradeResult(success=False, platform=platform or Platform.PAPER, error=f"Risk gate: {reason}")
    if RISK["require_approval"] and not override_approval:
        await store_pending_order(rec, amount_usd, platform)
        return TradeResult(success=False, error="Queued for approval. Check Trading page.", platform=platform or Platform.PAPER)
    if not platform: platform = select_platform(rec)
    direction = rec.direction or "YES"
    side = OrderSide.YES if direction in ["YES", "LONG"] else OrderSide.NO
    import re
    ticker = ""
    if platform == Platform.ALPACA:
        m = re.search(r'\(([A-Z]{1,5})\)', rec.asset_title or "")
        ticker = m.group(1) if m else ""
    elif platform == Platform.KALSHI:
        ticker = rec.asset_id.replace("kalshi_", "").upper()
    limit_price = None
    if rec.market_price:
        limit_price = min(0.99, (rec.market_price / 100) + 0.01) if side == OrderSide.YES else min(0.99, 1.0 - (rec.market_price / 100) + 0.01)
    order = LiveOrder(asset_id=rec.asset_id, platform=platform, side=side, order_type=order_type,
                      amount_usd=amount_usd, amount_usdc=amount_usd, ticker=ticker,
                      limit_price=limit_price, recommendation_id=rec.id,
                      ai_probability=rec.ai_probability or 0, ai_edge=rec.edge or 0, confidence=rec.confidence)
    if platform == Platform.POLYMARKET: result = await polymarket_engine.place_order(order)
    elif platform == Platform.KALSHI: result = await kalshi_engine.place_order(order)
    elif platform == Platform.ALPACA: result = await alpaca_engine.place_order(order)
    else: result = TradeResult(success=False, error=f"Platform {platform} not integrated", platform=platform)
    if result.success: await log_live_trade(rec, order, result)
    return result

async def get_portfolio_snapshot() -> PortfolioSnapshot:
    tasks = []
    if alpaca_engine.is_configured: tasks.append(alpaca_engine.get_account())
    if polymarket_engine.is_configured: tasks.append(polymarket_engine.get_balance())
    if kalshi_engine.is_configured: tasks.append(kalshi_engine.get_balance())
    results = await asyncio.gather(*tasks, return_exceptions=True)
    total_cash = 0.0; platform_data = {}
    for r in results:
        if isinstance(r, dict) and "error" not in r:
            if "buying_power" in r: total_cash += float(r.get("buying_power", 0)); platform_data["alpaca"] = r
            elif "balance_usdc" in r: total_cash += float(r.get("balance_usdc", 0)); platform_data["polymarket"] = r
            elif "balance_usd" in r: total_cash += float(r.get("balance_usd", 0)); platform_data["kalshi"] = r
    return PortfolioSnapshot(total_value_usd=total_cash, cash_available=total_cash,
                             platforms=platform_data, timestamp=datetime.utcnow())

async def get_daily_trade_count() -> int:
    try:
        db = get_db(); today = datetime.utcnow().date().isoformat()
        result = db.table("live_trades").select("id", count="exact").gte("executed_at", today).execute()
        return result.count or 0
    except: return 0

async def store_pending_order(rec: Recommendation, amount: float, platform):
    try:
        db = get_db()
        db.table("pending_orders").insert({
            "recommendation_id": rec.id, "rec_title": rec.title, "asset_id": rec.asset_id,
            "direction": rec.direction, "amount_usd": amount,
            "platform": platform.value if platform else "auto",
            "ai_probability": rec.ai_probability, "edge": rec.edge, "confidence": rec.confidence,
            "status": "pending_approval", "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e: print(f"⚠ store_pending_order: {e}")

async def log_live_trade(rec: Recommendation, order: LiveOrder, result: TradeResult):
    try:
        db = get_db()
        db.table("live_trades").insert({
            "id": result.order_id or f"local_{int(datetime.utcnow().timestamp())}",
            "recommendation_id": rec.id, "platform": result.platform.value,
            "asset_id": order.asset_id, "asset_title": rec.asset_title,
            "direction": order.side.value, "amount_usd": order.amount_usd,
            "price": result.price, "size": result.size, "status": result.status.value,
            "paper_mode": result.paper_mode, "ai_probability": order.ai_probability,
            "ai_edge": order.ai_edge, "confidence": order.confidence,
            "executed_at": (result.executed_at or datetime.utcnow()).isoformat()
        }).execute()
    except Exception as e: print(f"⚠ log_live_trade: {e}")
PYEOF

echo "[5/8] Creating API routers..."

cat > backend/api/recommendations.py << 'PYEOF'
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from backend.engines.recommendations import scan_for_recommendations, get_current_briefing
from backend.db.database import get_db
import uuid

router = APIRouter()

@router.get("/briefing")
async def get_briefing():
    briefing = await get_current_briefing()
    if not briefing:
        return {"summary": "No briefing yet. Click Scan now to generate your first briefing.",
                "recommendations": [], "global_events": [], "trade_count": 0,
                "watch_count": 0, "signals_processed": 0, "scan_number": 0,
                "generated_at": datetime.utcnow().isoformat()}
    return briefing.model_dump(mode="json")

@router.post("/scan")
async def trigger_scan(background_tasks: BackgroundTasks):
    background_tasks.add_task(scan_for_recommendations)
    return {"status": "scan_started", "message": "Scanning global markets... check back in ~60 seconds."}

@router.get("/recommendations")
async def list_recommendations(type: str = None, urgency: str = None, limit: int = 20):
    try:
        db = get_db()
        query = db.table("recommendations").select("*").order("confidence", desc=True).limit(limit)
        if type: query = query.eq("type", type)
        if urgency: query = query.eq("urgency", urgency)
        return {"recommendations": query.execute().data}
    except Exception as e:
        return {"recommendations": [], "error": str(e)}

@router.get("/events")
async def list_global_events(limit: int = 10):
    try:
        db = get_db()
        return {"events": db.table("global_events").select("*").order("scanned_at", desc=True).limit(limit).execute().data}
    except: return {"events": []}

@router.get("/history")
async def recommendation_history(days: int = 7, limit: int = 50):
    try:
        from datetime import timedelta
        db = get_db(); cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        return {"history": db.table("recommendations").select("*").gte("created_at", cutoff).order("created_at", desc=True).limit(limit).execute().data}
    except: return {"history": []}

@router.get("/watchlist")
async def get_watchlist(user_id: str = "default"):
    try:
        db = get_db()
        return {"watchlist": db.table("watchlist").select("*").eq("user_id", user_id).order("added_at", desc=True).execute().data}
    except: return {"watchlist": []}

class WatchlistAddRequest(BaseModel):
    asset_id: str; asset_title: str; asset_class: str
    alert_edge_threshold: float = 5.0; notes: str = ""

@router.post("/watchlist")
async def add_to_watchlist(req: WatchlistAddRequest, user_id: str = "default"):
    item = {"id": str(uuid.uuid4()), "user_id": user_id, "asset_id": req.asset_id,
            "asset_title": req.asset_title, "asset_class": req.asset_class,
            "alert_edge_threshold": req.alert_edge_threshold, "notes": req.notes,
            "added_at": datetime.utcnow().isoformat()}
    try:
        db = get_db(); db.table("watchlist").insert(item).execute()
    except Exception as e: print(f"⚠ watchlist add: {e}")
    return {"status": "added", "item": item}

@router.delete("/watchlist/{item_id}")
async def remove_from_watchlist(item_id: str):
    try:
        db = get_db(); db.table("watchlist").delete().eq("id", item_id).execute()
    except Exception as e: pass
    return {"status": "removed"}
PYEOF

cat > backend/api/live_trading.py << 'PYEOF'
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from backend.engines.platform_router import execute_recommendation, get_portfolio_snapshot
from backend.engines.polymarket_live import polymarket_engine
from backend.engines.kalshi_live import kalshi_engine
from backend.engines.alpaca_live import alpaca_engine
from backend.models.live_trading import Platform, OrderType
from backend.db.database import get_db

router = APIRouter()

@router.get("/portfolio")
async def get_live_portfolio():
    snapshot = await get_portfolio_snapshot()
    return snapshot.model_dump(mode="json")

@router.get("/accounts")
async def get_all_accounts():
    results = {}
    results["polymarket"] = await polymarket_engine.get_balance() if polymarket_engine.is_configured else {"status": "not_configured", "message": "Add POLYMARKET_API_KEY to Replit Secrets"}
    results["kalshi"] = await kalshi_engine.get_balance() if kalshi_engine.is_configured else {"status": "not_configured", "message": "Add KALSHI_EMAIL + KALSHI_PASSWORD to Replit Secrets"}
    results["alpaca"] = await alpaca_engine.get_account() if alpaca_engine.is_configured else {"status": "not_configured", "message": "Add ALPACA_API_KEY + ALPACA_SECRET_KEY to Replit Secrets"}
    return {"accounts": results}

class ExecuteOrderRequest(BaseModel):
    recommendation_id: str; amount_usd: float
    platform: Optional[str] = None; order_type: str = "GTC"
    override_approval: bool = False

@router.post("/execute")
async def execute_order(req: ExecuteOrderRequest):
    try:
        db = get_db()
        res = db.table("recommendations").select("*").eq("id", req.recommendation_id).single().execute()
        if not res.data: raise HTTPException(status_code=404, detail="Recommendation not found")
        from backend.models.recommendations import Recommendation
        rec = Recommendation(**res.data)
        platform = Platform(req.platform) if req.platform else None
        result = await execute_recommendation(rec=rec, amount_usd=req.amount_usd, platform=platform,
                                              order_type=OrderType(req.order_type),
                                              override_approval=req.override_approval)
        return result.model_dump(mode="json")
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@router.get("/pending")
async def get_pending_orders():
    try:
        db = get_db()
        return {"pending": db.table("pending_orders").select("*").eq("status", "pending_approval").order("created_at", desc=True).execute().data}
    except: return {"pending": []}

@router.post("/pending/{order_id}/approve")
async def approve_pending_order(order_id: str, amount_override: Optional[float] = None):
    try:
        db = get_db()
        od = db.table("pending_orders").select("*").eq("id", order_id).single().execute().data
        if not od: raise HTTPException(status_code=404, detail="Not found")
        rec_data = db.table("recommendations").select("*").eq("id", od["recommendation_id"]).single().execute().data
        from backend.models.recommendations import Recommendation
        rec = Recommendation(**rec_data)
        result = await execute_recommendation(rec=rec, amount_usd=amount_override or od["amount_usd"], override_approval=True)
        if result.success:
            db.table("pending_orders").update({"status": "approved", "approved_at": datetime.utcnow().isoformat()}).eq("id", order_id).execute()
        return result.model_dump(mode="json")
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@router.post("/pending/{order_id}/reject")
async def reject_pending_order(order_id: str):
    try:
        db = get_db(); db.table("pending_orders").update({"status": "rejected", "rejected_at": datetime.utcnow().isoformat()}).eq("id", order_id).execute()
    except: pass
    return {"status": "rejected"}

@router.get("/orders")
async def get_all_open_orders():
    results = {}
    if polymarket_engine.is_configured: results["polymarket"] = await polymarket_engine.get_open_orders()
    if kalshi_engine.is_configured: results["kalshi"] = await kalshi_engine.get_open_orders()
    if alpaca_engine.is_configured: results["alpaca"] = await alpaca_engine.get_open_orders()
    return {"orders": results}

@router.get("/positions")
async def get_all_positions():
    results = {}
    if polymarket_engine.is_configured: results["polymarket"] = await polymarket_engine.get_positions()
    if kalshi_engine.is_configured: results["kalshi"] = await kalshi_engine.get_positions()
    if alpaca_engine.is_configured: results["alpaca"] = await alpaca_engine.get_positions()
    return {"positions": results}

@router.delete("/orders/{platform}/{order_id}")
async def cancel_order(platform: str, order_id: str):
    engines = {"polymarket": polymarket_engine, "kalshi": kalshi_engine, "alpaca": alpaca_engine}
    engine = engines.get(platform)
    if not engine: raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")
    return {"cancelled": await engine.cancel_order(order_id), "order_id": order_id, "platform": platform}

@router.get("/history")
async def get_trade_history(limit: int = 50, platform: str = None):
    try:
        db = get_db()
        q = db.table("live_trades").select("*").order("executed_at", desc=True).limit(limit)
        if platform: q = q.eq("platform", platform)
        return {"trades": q.execute().data}
    except: return {"trades": []}
PYEOF

echo "[6/8] Updating main.py and config.py..."

# Update config.py with all new secrets
cat > backend/config.py << 'PYEOF'
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    anthropic_api_key: str = ""
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    database_url: str = ""
    upstash_redis_url: str = ""
    upstash_redis_token: str = ""
    # Polymarket
    polymarket_api_key: str = ""
    polymarket_secret: str = ""
    polymarket_passphrase: str = ""
    polymarket_private_key: str = ""
    polygon_wallet_address: str = ""
    # Kalshi
    kalshi_email: str = ""
    kalshi_password: str = ""
    # Alpaca
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_base_url: str = "https://paper-api.alpaca.markets"
    # Coinbase / Kraken
    coinbase_api_key: str = ""
    coinbase_api_secret: str = ""
    kraken_api_key: str = ""
    kraken_private_key: str = ""
    # Market data
    coingecko_api_key: str = ""
    newsapi_key: str = ""
    # Risk controls
    execution_mode: str = "manual"
    require_approval: str = "true"
    min_edge_to_execute: str = "5"
    min_confidence: str = "65"
    min_evidence_count: str = "3"
    max_position_pct: str = "0.05"
    max_daily_trades: str = "10"
    max_correlated_positions: str = "3"
    max_spread_pct: str = "0.08"
    daily_loss_limit_pct: str = "0.10"
    app_env: str = "development"
    paper_balance_default: float = 10000.0
    class Config:
        env_file = ".env"
        extra = "ignore"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
PYEOF

# Update main.py to register new routers and the recommendations scan job
cat > backend/main.py << 'PYEOF'
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import asyncio, json, os

from backend.api import markets, signals, portfolio, coach
from backend.api.recommendations import router as rec_router
from backend.api.live_trading import router as trading_router
from backend.tasks.jobs import fetch_all_markets, run_research_agent, run_recommendations_scan
from backend.db.database import init_db

app = FastAPI(title="Alpha Lens API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(markets.router, prefix="/api/markets", tags=["markets"])
app.include_router(signals.router, prefix="/api/signals", tags=["signals"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])
app.include_router(coach.router, prefix="/api/coach", tags=["coach"])
app.include_router(rec_router, prefix="/api/recommendations", tags=["recommendations"])
app.include_router(trading_router, prefix="/api/trading", tags=["trading"])

class ConnectionManager:
    def __init__(self): self.connections = {}
    async def connect(self, ws, asset_id):
        await ws.accept()
        if asset_id not in self.connections: self.connections[asset_id] = []
        self.connections[asset_id].append(ws)
    def disconnect(self, ws, asset_id):
        if asset_id in self.connections: self.connections[asset_id].remove(ws)

manager = ConnectionManager()

@app.websocket("/ws/signals/{asset_id}")
async def signal_websocket(ws: WebSocket, asset_id: str):
    await manager.connect(ws, asset_id)
    try:
        while True:
            await asyncio.sleep(30)
            await ws.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        manager.disconnect(ws, asset_id)

scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def startup():
    await init_db()
    scheduler.add_job(fetch_all_markets, "interval", minutes=15, id="fetch_markets", replace_existing=True)
    scheduler.add_job(run_research_agent, "interval", hours=1, id="research_agent", replace_existing=True)
    scheduler.add_job(run_recommendations_scan, "interval", minutes=30, id="recommendations_scan", replace_existing=True)
    scheduler.start()
    print("✓ Alpha Lens v3.0 started")
    print("  Jobs: markets(15min) · research(60min) · recommendations(30min)")

@app.on_event("shutdown")
async def shutdown(): scheduler.shutdown()

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "3.0.0",
            "jobs": ["fetch_markets", "research_agent", "recommendations_scan"]}

frontend_path = "frontend/out"
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True))
else:
    @app.get("/")
    async def root():
        return {"message": "Alpha Lens API running. Build frontend: cd frontend && npm install && npm run build"}
PYEOF

echo "[7/8] Updating jobs.py..."

cat > backend/tasks/jobs.py << 'PYEOF'
"""Background jobs via APScheduler — no separate worker needed on Replit."""
from backend.engines.ingestion import ingest_all_markets
from backend.engines.research import research_asset
from backend.engines.probability import score_asset
from backend.engines.recommendations import scan_for_recommendations
from backend.db.database import get_db
import asyncio

async def fetch_all_markets():
    print("-> Job: fetch_all_markets")
    try:
        assets = await ingest_all_markets()
        print(f"✓ Job: fetched {len(assets)} assets")
    except Exception as e: print(f"⚠ Job fetch_all_markets: {e}")

async def run_research_agent():
    print("-> Job: run_research_agent")
    try:
        db = get_db()
        from datetime import datetime, timedelta
        cutoff = (datetime.utcnow() - timedelta(hours=1)).isoformat()
        res = db.table("assets").select("*").lt("last_scored_at", cutoff).order("market_price", desc=True).limit(10).execute()
        from backend.models.asset import Asset
        for asset_data in res.data:
            asset = Asset(**asset_data)
            evidence = await research_asset(asset)
            await score_asset(asset, evidence)
            await asyncio.sleep(2)
        print(f"✓ Job: scored {len(res.data)} assets")
    except Exception as e: print(f"⚠ Job run_research_agent: {e}")

async def run_recommendations_scan():
    print("-> Job: run_recommendations_scan")
    try:
        briefing = await scan_for_recommendations()
        print(f"✓ Job: {briefing.trade_count} trades, {briefing.watch_count} watches, scan #{briefing.scan_number}")
    except Exception as e: print(f"⚠ Job run_recommendations_scan: {e}")
PYEOF

echo "[8/8] Adding new database tables to Supabase..."

cat > scripts/add_new_tables.sql << 'SQLEOF'
-- Run this in your Supabase SQL Editor
-- Adds tables for: Recommendations, Live Trading, Watchlist, Global Events

CREATE TABLE IF NOT EXISTS daily_briefings (
    id TEXT PRIMARY KEY,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    summary TEXT DEFAULT '',
    trade_count INTEGER DEFAULT 0,
    watch_count INTEGER DEFAULT 0,
    signals_processed INTEGER DEFAULT 0,
    scan_number INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    briefing_id TEXT REFERENCES daily_briefings(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    urgency TEXT DEFAULT 'medium',
    title TEXT NOT NULL,
    asset_id TEXT DEFAULT '',
    asset_title TEXT DEFAULT '',
    asset_class TEXT DEFAULT '',
    sector TEXT DEFAULT '',
    region TEXT DEFAULT '',
    direction TEXT DEFAULT 'WATCH',
    ai_probability DOUBLE PRECISION,
    market_price DOUBLE PRECISION,
    edge DOUBLE PRECISION,
    headline TEXT DEFAULT '',
    why JSONB DEFAULT '[]',
    historical_context TEXT DEFAULT '',
    bear_case TEXT DEFAULT '',
    entry_trigger TEXT DEFAULT '',
    confidence INTEGER DEFAULT 60,
    window TEXT DEFAULT '',
    urgency_reason TEXT DEFAULT '',
    sources JSONB DEFAULT '[]',
    outcome TEXT,
    outcome_pct DOUBLE PRECISION,
    outcome_recorded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS global_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    region TEXT DEFAULT '',
    impact_level TEXT DEFAULT 'medium',
    detail TEXT DEFAULT '',
    affected_assets JSONB DEFAULT '[]',
    direction TEXT DEFAULT 'mixed',
    time_context TEXT DEFAULT '',
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default',
    asset_id TEXT NOT NULL,
    asset_title TEXT DEFAULT '',
    asset_class TEXT DEFAULT '',
    alert_edge_threshold DOUBLE PRECISION DEFAULT 5.0,
    notes TEXT DEFAULT '',
    added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_trades (
    id TEXT PRIMARY KEY,
    recommendation_id TEXT,
    platform TEXT NOT NULL,
    asset_id TEXT DEFAULT '',
    asset_title TEXT DEFAULT '',
    direction TEXT NOT NULL,
    amount_usd DOUBLE PRECISION DEFAULT 0,
    price DOUBLE PRECISION DEFAULT 0,
    size DOUBLE PRECISION DEFAULT 0,
    status TEXT DEFAULT 'open',
    paper_mode BOOLEAN DEFAULT false,
    ai_probability DOUBLE PRECISION,
    ai_edge DOUBLE PRECISION,
    confidence INTEGER,
    realized_pnl DOUBLE PRECISION,
    closed_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_orders (
    id BIGSERIAL PRIMARY KEY,
    recommendation_id TEXT,
    rec_title TEXT DEFAULT '',
    asset_id TEXT DEFAULT '',
    direction TEXT DEFAULT '',
    amount_usd DOUBLE PRECISION DEFAULT 0,
    platform TEXT DEFAULT 'auto',
    ai_probability DOUBLE PRECISION,
    edge DOUBLE PRECISION,
    confidence INTEGER,
    status TEXT DEFAULT 'pending_approval',
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
SQLEOF

echo ""
echo "============================================"
echo "  INSTALL COMPLETE"
echo "============================================"
echo ""
echo "FILES CREATED:"
echo "  backend/models/live_trading.py"
echo "  backend/models/recommendations.py"
echo "  backend/engines/recommendations.py    (E6)"
echo "  backend/engines/polymarket_live.py    (E7a)"
echo "  backend/engines/kalshi_live.py        (E7b)"
echo "  backend/engines/alpaca_live.py        (E7c)"
echo "  backend/engines/platform_router.py    (E7d)"
echo "  backend/api/recommendations.py"
echo "  backend/api/live_trading.py"
echo "  scripts/add_new_tables.sql"
echo ""
echo "FILES UPDATED:"
echo "  backend/config.py   (new secrets added)"
echo "  backend/main.py     (new routes + scheduler job)"
echo "  backend/tasks/jobs.py (recommendations scan job)"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Add new secrets to Replit Secrets (padlock icon):"
echo "     KALSHI_EMAIL, KALSHI_PASSWORD"
echo "     POLYMARKET_API_KEY, POLYMARKET_SECRET, POLYMARKET_PASSPHRASE"
echo "     ALPACA_API_KEY, ALPACA_SECRET_KEY"
echo "     EXECUTION_MODE=manual"
echo "     REQUIRE_APPROVAL=true"
echo ""
echo "  2. Run new SQL in Supabase SQL Editor:"
echo "     Copy scripts/add_new_tables.sql → paste → Run"
echo ""
echo "  3. Hit the green Run button in Replit"
echo ""
echo "  4. Test: curl https://your-repl.replit.app/api/trading/accounts"
echo "     Should show configured/not-configured status for each platform"
echo ""
echo "  5. Test recommendations: POST /api/recommendations/scan"
echo "     Then GET /api/recommendations/briefing"
echo ""
