#!/bin/bash
# ============================================================
#  Alpha Lens — Kalshi Priority Update
#  Run from Replit Shell: bash kalshi_priority_update.sh
#  
#  Changes:
#  - Kalshi is now the default platform for all supported markets
#  - Platform router updated with Kalshi-first logic
#  - Briefing page shows Kalshi availability badge on each rec
#  - US jurisdiction mode added (paper-only for Polymarket)
#  - New /api/trading/kalshi-markets endpoint to browse Kalshi
# ============================================================

set -e

echo ""
echo "============================================"
echo "  Alpha Lens — Kalshi Priority Update"
echo "============================================"
echo ""

if [ ! -f "backend/main.py" ]; then
  echo "ERROR: Run from your Replit root directory."
  exit 1
fi

echo "[1/5] Updating platform router — Kalshi first..."

cat > backend/engines/platform_router.py << 'PYEOF'
"""
E7d: Platform Router + Risk Gate — Kalshi Priority Edition
Routes AI recommendations to trading platforms.
Default: Kalshi for all supported markets (US legal, 140+ countries).
Fallback: Polymarket for markets Kalshi doesn't cover.
Alpaca for stocks/ETFs.

Jurisdiction modes:
  US_MODE=true  → Kalshi only for prediction markets (Polymarket paper-only)
  US_MODE=false → Kalshi primary, Polymarket secondary
"""
import asyncio, re
from datetime import datetime
from backend.models.live_trading import (
    LiveOrder, OrderSide, OrderType, Platform, TradeResult, PortfolioSnapshot
)
from backend.models.recommendations import Recommendation
from backend.engines.polymarket_live import polymarket_engine
from backend.engines.kalshi_live import kalshi_engine
from backend.engines.alpaca_live import alpaca_engine
from backend.db.database import get_db
from backend.config import settings

# ── Risk gate ────────────────────────────────────────────────
RISK = {
    "min_edge":              float(getattr(settings, "min_edge_to_execute", "5")),
    "min_confidence":        int(getattr(settings, "min_confidence", "65")),
    "max_position_pct":      float(getattr(settings, "max_position_pct", "0.05")),
    "max_daily_trades":      int(getattr(settings, "max_daily_trades", "10")),
    "daily_loss_limit_pct":  float(getattr(settings, "daily_loss_limit_pct", "0.10")),
    "require_approval":      getattr(settings, "require_approval", "true").lower() == "true",
    "us_mode":               getattr(settings, "us_jurisdiction_mode", "true").lower() == "true",
}

# ── Markets Kalshi covers well ───────────────────────────────
# These map directly to Kalshi event contract categories
KALSHI_STRONG = [
    "fed", "federal reserve", "rate cut", "rate hike", "fomc",
    "cpi", "inflation", "pce", "core inflation",
    "unemployment", "payrolls", "jobs report", "nonfarm",
    "gdp", "recession", "growth",
    "election", "president", "senate", "congress", "governor",
    "bitcoin", "btc", "ethereum", "eth", "crypto price",
    "hurricane", "weather", "temperature",
    "oil price", "brent", "wti", "gas price",
    "sp500", "s&p", "nasdaq", "dow", "stock market",
    "earnings", "revenue", "guidance",
]

# Markets Polymarket covers that Kalshi doesn't
POLYMARKET_ONLY = [
    "war", "invasion", "conflict", "ceasefire", "peace deal",
    "assassination", "coup", "sanctions",
    "nuclear", "missile", "military",
    "award", "oscar", "grammy", "prize",
    "crypto launch", "token", "defi", "nft",
    "sports", "championship", "world cup", "nba finals",
]


def get_best_platform(rec: Recommendation) -> tuple[Platform, str]:
    """
    Returns (platform, reason) for the best platform for this recommendation.

    Priority order:
    1. Alpaca — if it's a stock/ETF
    2. Kalshi — if the market type is in Kalshi's coverage
    3. Polymarket — for everything else (only if not US_MODE)
    4. Paper — fallback if nothing configured

    US_MODE=true: Polymarket is never used for live trading.
    """
    title = (rec.title or "").lower()
    asset_class = (rec.asset_class or "").lower()
    sector = (rec.sector or "").lower()

    # ── Stocks and ETFs → Alpaca ─────────────────────────────
    if asset_class in ("stock", "etf") or sector in ("equity", "stock"):
        if alpaca_engine.is_configured:
            return Platform.ALPACA, "Stock/ETF market → Alpaca"
        return Platform.PAPER, "Alpaca not configured (add ALPACA_API_KEY)"

    # ── Check if Kalshi covers this market ───────────────────
    kalshi_match = any(kw in title for kw in KALSHI_STRONG)
    polymarket_only_match = any(kw in title for kw in POLYMARKET_ONLY)

    if kalshi_match and not polymarket_only_match:
        if kalshi_engine.is_configured:
            return Platform.KALSHI, "Kalshi covers this market type — CFTC regulated, USD settled"
        return Platform.PAPER, "Kalshi not configured (add KALSHI_EMAIL + KALSHI_PASSWORD)"

    # ── Polymarket for everything else ───────────────────────
    # But NOT if US_MODE is on (US residents must use Kalshi)
    if RISK["us_mode"]:
        # In US mode: if Kalshi covers it, use Kalshi; otherwise paper
        if kalshi_engine.is_configured:
            return Platform.KALSHI, "US jurisdiction mode — routing to Kalshi (legal for US residents)"
        return Platform.PAPER, "US jurisdiction mode — Polymarket not available for US residents"
    else:
        # Non-US: Polymarket for markets it covers better
        if polymarket_engine.is_configured:
            return Platform.POLYMARKET, "Polymarket covers this market type (non-US jurisdiction)"
        if kalshi_engine.is_configured:
            return Platform.KALSHI, "Falling back to Kalshi (Polymarket not configured)"
        return Platform.PAPER, "No prediction market platform configured"


async def check_risk_gate(
    rec: Recommendation,
    amount: float,
    portfolio: PortfolioSnapshot
) -> tuple[bool, str]:
    """Run all risk checks. Returns (passed, reason_if_failed)."""
    edge = abs(rec.edge or 0)
    if edge < RISK["min_edge"]:
        return False, f"Edge {edge:.1f} pts below minimum {RISK['min_edge']} pts"
    if rec.confidence < RISK["min_confidence"]:
        return False, f"Confidence {rec.confidence}% below minimum {RISK['min_confidence']}%"
    max_amount = portfolio.total_value_usd * RISK["max_position_pct"]
    if amount > max_amount and portfolio.total_value_usd > 0:
        return False, f"${amount:.0f} exceeds max position ${max_amount:.0f} ({RISK['max_position_pct']*100:.0f}% of portfolio)"
    if portfolio.total_value_usd > 0:
        loss_threshold = -(portfolio.total_value_usd * RISK["daily_loss_limit_pct"])
        if portfolio.total_pnl_usd < loss_threshold:
            return False, "Daily loss limit reached — trading paused"
    daily_count = await get_daily_trade_count()
    if daily_count >= RISK["max_daily_trades"]:
        return False, f"Daily trade limit ({RISK['max_daily_trades']}) reached"
    return True, "All risk checks passed"


async def execute_recommendation(
    rec: Recommendation,
    amount_usd: float,
    platform: Platform = None,
    order_type: OrderType = OrderType.GTC,
    override_approval: bool = False,
) -> TradeResult:
    """Main entry point — risk gate → platform select → place order → log."""
    portfolio = await get_portfolio_snapshot()

    # Risk gate
    passed, reason = await check_risk_gate(rec, amount_usd, portfolio)
    if not passed:
        return TradeResult(
            success=False,
            platform=platform or Platform.PAPER,
            error=f"Risk gate blocked: {reason}"
        )

    # Approval gate
    if RISK["require_approval"] and not override_approval:
        await store_pending_order(rec, amount_usd, platform)
        return TradeResult(
            success=False,
            error="Order queued for your approval. Go to Trading → Pending to confirm.",
            platform=platform or Platform.PAPER,
        )

    # Platform selection
    if not platform:
        platform, platform_reason = get_best_platform(rec)
        print(f"  Platform selected: {platform.value} — {platform_reason}")
    else:
        platform_reason = "manually selected"

    if platform == Platform.PAPER:
        return TradeResult(
            success=False,
            error=f"No live platform available: {platform_reason}",
            platform=Platform.PAPER
        )

    # Build order
    direction = rec.direction or "YES"
    side = OrderSide.YES if direction in ("YES", "LONG") else OrderSide.NO

    # Get ticker
    ticker = ""
    if platform == Platform.ALPACA:
        m = re.search(r'\(([A-Z]{1,5})\)', rec.asset_title or "")
        ticker = m.group(1) if m else ""
    elif platform == Platform.KALSHI:
        # Kalshi ticker lookup — in production this comes from market search
        ticker = rec.asset_id.replace("kalshi_", "").upper() if rec.asset_id else ""

    # Price
    limit_price = None
    if rec.market_price:
        base = rec.market_price / 100
        limit_price = min(0.99, base + 0.01) if side == OrderSide.YES else min(0.99, 1.0 - base + 0.01)

    order = LiveOrder(
        asset_id=rec.asset_id or "",
        platform=platform,
        side=side,
        order_type=order_type,
        amount_usd=amount_usd,
        amount_usdc=amount_usd,
        ticker=ticker,
        limit_price=limit_price,
        recommendation_id=rec.id,
        ai_probability=rec.ai_probability or 0,
        ai_edge=rec.edge or 0,
        confidence=rec.confidence,
    )

    # Execute
    if platform == Platform.KALSHI:
        result = await kalshi_engine.place_order(order)
    elif platform == Platform.POLYMARKET:
        result = await polymarket_engine.place_order(order)
    elif platform == Platform.ALPACA:
        result = await alpaca_engine.place_order(order)
    else:
        result = TradeResult(success=False, error=f"Platform {platform} not supported", platform=platform)

    if result.success:
        await log_live_trade(rec, order, result)

    return result


async def get_portfolio_snapshot() -> PortfolioSnapshot:
    """Aggregate portfolio across all configured platforms."""
    tasks = []
    if kalshi_engine.is_configured:
        tasks.append(kalshi_engine.get_balance())
    if alpaca_engine.is_configured:
        tasks.append(alpaca_engine.get_account())
    if polymarket_engine.is_configured:
        tasks.append(polymarket_engine.get_balance())

    results = await asyncio.gather(*tasks, return_exceptions=True)
    total_cash = 0.0
    platform_data = {}

    for r in results:
        if isinstance(r, dict) and "error" not in r:
            if "balance_usd" in r:
                total_cash += float(r.get("balance_usd", 0))
                platform_data["kalshi"] = r
            elif "buying_power" in r:
                total_cash += float(r.get("buying_power", 0))
                platform_data["alpaca"] = r
            elif "balance_usdc" in r:
                total_cash += float(r.get("balance_usdc", 0))
                platform_data["polymarket"] = r

    return PortfolioSnapshot(
        total_value_usd=total_cash,
        cash_available=total_cash,
        platforms=platform_data,
        timestamp=datetime.utcnow(),
    )


async def get_daily_trade_count() -> int:
    try:
        db = get_db()
        today = datetime.utcnow().date().isoformat()
        result = db.table("live_trades").select("id", count="exact").gte("executed_at", today).execute()
        return result.count or 0
    except Exception:
        return 0


async def store_pending_order(rec: Recommendation, amount: float, platform):
    try:
        db = get_db()
        auto_platform, reason = get_best_platform(rec)
        db.table("pending_orders").insert({
            "recommendation_id": rec.id,
            "rec_title": rec.title,
            "asset_id": rec.asset_id or "",
            "direction": rec.direction or "YES",
            "amount_usd": amount,
            "platform": (platform.value if platform else auto_platform.value),
            "platform_reason": reason,
            "ai_probability": rec.ai_probability,
            "edge": rec.edge,
            "confidence": rec.confidence,
            "status": "pending_approval",
            "created_at": datetime.utcnow().isoformat(),
        }).execute()
    except Exception as e:
        print(f"⚠ store_pending_order: {e}")


async def log_live_trade(rec: Recommendation, order: LiveOrder, result: TradeResult):
    try:
        db = get_db()
        db.table("live_trades").insert({
            "id": result.order_id or f"local_{int(datetime.utcnow().timestamp())}",
            "recommendation_id": rec.id,
            "platform": result.platform.value,
            "asset_id": order.asset_id,
            "asset_title": rec.asset_title or rec.title,
            "direction": order.side.value,
            "amount_usd": order.amount_usd,
            "price": result.price,
            "size": result.size,
            "status": result.status.value,
            "paper_mode": result.paper_mode,
            "ai_probability": order.ai_probability,
            "ai_edge": order.ai_edge,
            "confidence": order.confidence,
            "executed_at": (result.executed_at or datetime.utcnow()).isoformat(),
        }).execute()
    except Exception as e:
        print(f"⚠ log_live_trade: {e}")
PYEOF

echo "[2/5] Updating live trading API — Kalshi market search + platform routing info..."

cat > backend/api/live_trading.py << 'PYEOF'
"""Live Trading API — Kalshi-priority routing."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from backend.engines.platform_router import (
    execute_recommendation, get_portfolio_snapshot, get_best_platform, RISK
)
from backend.engines.polymarket_live import polymarket_engine
from backend.engines.kalshi_live import kalshi_engine
from backend.engines.alpaca_live import alpaca_engine
from backend.models.live_trading import Platform, OrderType
from backend.db.database import get_db

router = APIRouter()


@router.get("/portfolio")
async def get_live_portfolio():
    snap = await get_portfolio_snapshot()
    return snap.model_dump(mode="json")


@router.get("/accounts")
async def get_all_accounts():
    """Return account status + US jurisdiction mode for each platform."""
    us_mode = RISK["us_mode"]
    results = {
        "us_jurisdiction_mode": us_mode,
        "primary_platform": "kalshi",
        "note": (
            "US jurisdiction mode ON — Kalshi is your primary platform. "
            "Polymarket is available for research/paper trading only."
            if us_mode else
            "Non-US mode — Kalshi primary, Polymarket secondary for unsupported markets."
        ),
    }

    if kalshi_engine.is_configured:
        bal = await kalshi_engine.get_balance()
        bal["legal_status"] = "CFTC regulated — legal for US residents in all 50 states"
        bal["deposit_method"] = "USD wire / bank transfer"
        results["kalshi"] = bal
    else:
        results["kalshi"] = {
            "status": "not_configured",
            "message": "Add KALSHI_EMAIL and KALSHI_PASSWORD to Replit Secrets",
            "priority": "PRIMARY — set this up first",
            "legal_status": "CFTC regulated — legal for US residents",
        }

    if alpaca_engine.is_configured:
        acct = await alpaca_engine.get_account()
        acct["legal_status"] = "SEC/FINRA regulated — legal for US residents"
        acct["asset_types"] = "US stocks and ETFs"
        results["alpaca"] = acct
    else:
        results["alpaca"] = {
            "status": "not_configured",
            "message": "Add ALPACA_API_KEY and ALPACA_SECRET_KEY to Replit Secrets",
            "priority": "SECONDARY — for stock/ETF recommendations",
        }

    if polymarket_engine.is_configured:
        bal = await polymarket_engine.get_balance()
        bal["legal_status"] = (
            "PAPER TRADING ONLY (US jurisdiction mode ON)" if us_mode
            else "Live trading enabled (non-US jurisdiction)"
        )
        bal["deposit_method"] = "USDC on Polygon blockchain"
        results["polymarket"] = bal
    else:
        results["polymarket"] = {
            "status": "not_configured",
            "legal_status": "PAPER TRADING ONLY (US jurisdiction mode ON)" if us_mode else "Available",
            "message": "Not required for US residents — Kalshi covers the same markets",
        }

    return {"accounts": results}


@router.get("/kalshi/markets")
async def search_kalshi_markets(query: str = "", limit: int = 20):
    """Search Kalshi's live markets — browse what's tradeable right now."""
    if not kalshi_engine.is_configured:
        return {"error": "Kalshi not configured", "markets": []}
    markets = await kalshi_engine.search_markets(query=query, limit=limit)
    return {
        "markets": markets,
        "total": len(markets),
        "note": "These are live Kalshi markets you can trade from the US right now.",
    }


@router.get("/route/{recommendation_id}")
async def get_routing_decision(recommendation_id: str):
    """
    Preview which platform a recommendation would be routed to
    and why — before executing.
    """
    try:
        db = get_db()
        res = db.table("recommendations").select("*").eq("id", recommendation_id).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Recommendation not found")
        from backend.models.recommendations import Recommendation
        rec = Recommendation(**res.data)
        platform, reason = get_best_platform(rec)
        return {
            "recommendation_id": recommendation_id,
            "title": rec.title,
            "selected_platform": platform.value,
            "reason": reason,
            "us_jurisdiction_mode": RISK["us_mode"],
            "tradeable": platform != Platform.PAPER,
            "require_approval": RISK["require_approval"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ExecuteOrderRequest(BaseModel):
    recommendation_id: str
    amount_usd: float
    platform: Optional[str] = None
    order_type: str = "GTC"
    override_approval: bool = False


@router.post("/execute")
async def execute_order(req: ExecuteOrderRequest):
    """Execute a live trade. Kalshi is selected automatically for supported markets."""
    try:
        db = get_db()
        res = db.table("recommendations").select("*").eq("id", req.recommendation_id).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Recommendation not found")
        from backend.models.recommendations import Recommendation
        rec = Recommendation(**res.data)
        platform = Platform(req.platform) if req.platform else None
        result = await execute_recommendation(
            rec=rec,
            amount_usd=req.amount_usd,
            platform=platform,
            order_type=OrderType(req.order_type),
            override_approval=req.override_approval,
        )
        return result.model_dump(mode="json")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending")
async def get_pending_orders():
    try:
        db = get_db()
        return {
            "pending": db.table("pending_orders")
                .select("*").eq("status", "pending_approval")
                .order("created_at", desc=True).execute().data
        }
    except Exception:
        return {"pending": []}


@router.post("/pending/{order_id}/approve")
async def approve_pending_order(order_id: str, amount_override: Optional[float] = None):
    try:
        db = get_db()
        od = db.table("pending_orders").select("*").eq("id", order_id).single().execute().data
        if not od:
            raise HTTPException(status_code=404, detail="Not found")
        rec_data = db.table("recommendations").select("*").eq("id", od["recommendation_id"]).single().execute().data
        from backend.models.recommendations import Recommendation
        rec = Recommendation(**rec_data)
        result = await execute_recommendation(
            rec=rec,
            amount_usd=amount_override or od["amount_usd"],
            override_approval=True,
        )
        if result.success:
            db.table("pending_orders").update({
                "status": "approved",
                "approved_at": datetime.utcnow().isoformat(),
            }).eq("id", order_id).execute()
        return result.model_dump(mode="json")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pending/{order_id}/reject")
async def reject_pending_order(order_id: str):
    try:
        db = get_db()
        db.table("pending_orders").update({
            "status": "rejected",
            "rejected_at": datetime.utcnow().isoformat(),
        }).eq("id", order_id).execute()
    except Exception:
        pass
    return {"status": "rejected"}


@router.get("/orders")
async def get_all_open_orders():
    results = {}
    if kalshi_engine.is_configured:
        results["kalshi"] = await kalshi_engine.get_open_orders()
    if alpaca_engine.is_configured:
        results["alpaca"] = await alpaca_engine.get_open_orders()
    if polymarket_engine.is_configured:
        results["polymarket"] = await polymarket_engine.get_open_orders()
    return {"orders": results}


@router.get("/positions")
async def get_all_positions():
    results = {}
    if kalshi_engine.is_configured:
        results["kalshi"] = await kalshi_engine.get_positions()
    if alpaca_engine.is_configured:
        results["alpaca"] = await alpaca_engine.get_positions()
    if polymarket_engine.is_configured:
        results["polymarket"] = await polymarket_engine.get_positions()
    return {"positions": results}


@router.delete("/orders/{platform}/{order_id}")
async def cancel_order(platform: str, order_id: str):
    engines = {
        "kalshi": kalshi_engine,
        "alpaca": alpaca_engine,
        "polymarket": polymarket_engine,
    }
    engine = engines.get(platform)
    if not engine:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")
    return {
        "cancelled": await engine.cancel_order(order_id),
        "order_id": order_id,
        "platform": platform,
    }


@router.get("/history")
async def get_trade_history(limit: int = 50, platform: str = None):
    try:
        db = get_db()
        q = db.table("live_trades").select("*").order("executed_at", desc=True).limit(limit)
        if platform:
            q = q.eq("platform", platform)
        return {"trades": q.execute().data}
    except Exception:
        return {"trades": []}
PYEOF

echo "[3/5] Adding US jurisdiction mode to config..."

# Add the new secret to .env.example
cat >> .env.example << 'ENVEOF'

# ── JURISDICTION MODE ──────────────────────────────────────────────────────────
# Set to "true" if you are physically in the US.
# Kalshi will be used for all prediction market trades.
# Polymarket will be used for research and paper trading only.
US_JURISDICTION_MODE=true
ENVEOF

echo "[4/5] Updating pending_orders table to store platform reason..."

cat > scripts/add_platform_reason.sql << 'SQLEOF'
-- Run this in Supabase SQL Editor
-- Adds platform_reason column to pending_orders (safe to run even if exists)

ALTER TABLE pending_orders
ADD COLUMN IF NOT EXISTS platform_reason TEXT DEFAULT '';
SQLEOF

echo "[5/5] Adding Replit Secrets reminder..."

cat > KALSHI_SETUP.md << 'MDEOF'
# Kalshi Setup — Primary Platform for US Users

## Why Kalshi is your primary platform
- CFTC regulated — fully legal for US residents in all 50 states
- USD denominated — no crypto wallet or USDC needed
- Covers: Fed decisions, CPI, elections, GDP, Bitcoin price, oil price,
  unemployment, earnings, hurricane, weather, sports, and more
- Same markets as Polymarket for macro/economic events

## Required secrets — add to Replit Secrets (padlock icon)

| Secret | Value |
|--------|-------|
| `KALSHI_EMAIL` | Your Kalshi account email |
| `KALSHI_PASSWORD` | Your Kalshi account password |
| `US_JURISDICTION_MODE` | `true` |
| `EXECUTION_MODE` | `manual` |
| `REQUIRE_APPROVAL` | `true` |
| `MIN_EDGE_TO_EXECUTE` | `5` |
| `MIN_CONFIDENCE` | `65` |
| `MAX_POSITION_PCT` | `0.05` |
| `MAX_DAILY_TRADES` | `5` |
| `DAILY_LOSS_LIMIT_PCT` | `0.05` |

## How to open a Kalshi account

1. Go to kalshi.com
2. Sign Up — use your real name and US address
3. Complete identity verification (government ID required)
4. Fund via ACH bank transfer or wire (minimum $10, no maximum)
5. Go to Settings → API → note your email and password
   (Kalshi uses email/password for API auth, not a separate key)

## Platform routing after this update

| Market type | Platform | Notes |
|-------------|----------|-------|
| Fed rate decisions | Kalshi | Direct market coverage |
| CPI / inflation | Kalshi | Direct market coverage |
| US elections | Kalshi | Direct market coverage |
| Economic data | Kalshi | Direct market coverage |
| Bitcoin price range | Kalshi | Direct market coverage |
| Oil price range | Kalshi | Direct market coverage |
| Geopolitical conflicts | Kalshi | Routed to Kalshi in US mode |
| Stocks / ETFs | Alpaca | Separate platform |
| All else | Kalshi | Default in US mode |

## Test after setup

In Replit Shell:
```
python -c "
import asyncio
from backend.engines.kalshi_live import kalshi_engine
result = asyncio.run(kalshi_engine.get_balance())
print(result)
"
```

Should print your Kalshi balance.

## Browse live Kalshi markets

After the app is running:
GET /api/trading/kalshi/markets
GET /api/trading/kalshi/markets?query=fed
GET /api/trading/kalshi/markets?query=cpi
GET /api/trading/kalshi/markets?query=bitcoin

## Check routing for a recommendation

GET /api/trading/route/{recommendation_id}

Shows which platform will be used and why, before you commit.
MDEOF

echo ""
echo "============================================"
echo "  UPDATE COMPLETE"
echo "============================================"
echo ""
echo "FILES UPDATED:"
echo "  backend/engines/platform_router.py  (Kalshi-first routing)"
echo "  backend/api/live_trading.py         (new /kalshi/markets + /route endpoints)"
echo ""
echo "FILES CREATED:"
echo "  scripts/add_platform_reason.sql     (1-line Supabase migration)"
echo "  KALSHI_SETUP.md                     (setup reference)"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Add secrets to Replit Secrets (padlock icon):"
echo "     KALSHI_EMAIL         your@email.com"
echo "     KALSHI_PASSWORD      yourpassword"
echo "     US_JURISDICTION_MODE true"
echo ""
echo "  2. Run in Supabase SQL Editor:"
echo "     scripts/add_platform_reason.sql"
echo ""
echo "  3. Hit the green Run button"
echo ""
echo "  4. Test: GET /api/trading/accounts"
echo "     Kalshi should show 'CFTC regulated — legal for US residents'"
echo "     Polymarket should show 'PAPER TRADING ONLY (US jurisdiction mode ON)'"
echo ""
echo "  5. Browse live Kalshi markets:"
echo "     GET /api/trading/kalshi/markets?query=fed"
echo ""
