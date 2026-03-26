from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
from backend.db.database import get_db
from backend.config import settings
from backend.models.asset import PaperTrade
import uuid

router = APIRouter()

# In-memory fallback if DB not configured
_memory_portfolio = {
    "balance": settings.paper_balance_default,
    "trades": []
}


class OpenTradeRequest(BaseModel):
    asset_id: str
    asset_title: str
    asset_class: str
    direction: str       # YES | NO | LONG | SHORT
    amount: float
    market_price: float
    ai_probability: float


class CloseTradeRequest(BaseModel):
    trade_id: str
    exit_price: float


@router.get("/")
async def get_portfolio():
    """Return paper trading portfolio state."""
    try:
        db = get_db()
        trades = db.table("paper_trades").select("*").order("opened_at", desc=True).execute()
        balance_res = db.table("portfolio_state").select("*").limit(1).execute()
        balance = balance_res.data[0]["balance"] if balance_res.data else settings.paper_balance_default

        open_trades = [t for t in trades.data if t["status"] == "open"]
        closed_trades = [t for t in trades.data if t["status"] == "closed"]
        total_pnl = sum(t.get("pnl", 0) or 0 for t in closed_trades)
        wins = sum(1 for t in closed_trades if (t.get("pnl") or 0) > 0)
        win_rate = round(wins / len(closed_trades) * 100) if closed_trades else 0

        return {
            "balance": balance,
            "total_pnl": round(total_pnl, 2),
            "win_rate": win_rate,
            "trade_count": len(closed_trades),
            "open_positions": open_trades,
            "recent_trades": closed_trades[:10],
        }
    except Exception:
        return {
            "balance": _memory_portfolio["balance"],
            "total_pnl": 0,
            "win_rate": 0,
            "trade_count": 0,
            "open_positions": [],
            "recent_trades": [],
            "demo": True,
        }


@router.post("/trade")
async def open_trade(req: OpenTradeRequest):
    """Open a new paper trade."""
    if req.amount < 10:
        raise HTTPException(status_code=400, detail="Minimum trade: $10")
    if req.amount > settings.paper_balance_default * settings.max_position_pct * 4:
        raise HTTPException(status_code=400, detail="Exceeds max position size")

    trade = PaperTrade(
        id=str(uuid.uuid4()),
        asset_id=req.asset_id,
        asset_title=req.asset_title,
        asset_class=req.asset_class,
        direction=req.direction,
        amount=req.amount,
        entry_price=req.market_price,
        entry_ai_prob=req.ai_probability,
        entry_edge=round(req.ai_probability - req.market_price, 1),
        shares=round(req.amount / (req.market_price / 100), 4) if req.market_price > 0 else 0,
        status="open",
        opened_at=datetime.utcnow(),
    )

    try:
        db = get_db()
        data = trade.model_dump(exclude_none=True)
        for k in ["opened_at", "closed_at"]:
            if k in data and data[k]:
                data[k] = data[k].isoformat()
        db.table("paper_trades").insert(data).execute()

        # Deduct from balance
        db.table("portfolio_state").upsert(
            {"id": "main", "balance": settings.paper_balance_default - req.amount},
            on_conflict="id"
        ).execute()
    except Exception:
        _memory_portfolio["trades"].append(trade.model_dump())
        _memory_portfolio["balance"] -= req.amount

    return {"trade_id": trade.id, "status": "open", "amount": req.amount}


@router.post("/close")
async def close_trade(req: CloseTradeRequest):
    """Close a paper trade and calculate P&L."""
    try:
        db = get_db()
        res = db.table("paper_trades").select("*").eq("id", req.trade_id).single().execute()
        trade_data = res.data

        shares = trade_data.get("shares", 0)
        direction = trade_data.get("direction", "YES")

        if direction in ["YES", "LONG"]:
            payout = shares * (req.exit_price / 100)
        else:
            payout = shares * ((100 - req.exit_price) / 100)

        pnl = round(payout - trade_data["amount"], 2)

        db.table("paper_trades").update({
            "status": "closed",
            "exit_price": req.exit_price,
            "pnl": pnl,
            "closed_at": datetime.utcnow().isoformat(),
        }).eq("id", req.trade_id).execute()

        return {
            "trade_id": req.trade_id,
            "pnl": pnl,
            "result": "win" if pnl > 0 else "loss",
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
