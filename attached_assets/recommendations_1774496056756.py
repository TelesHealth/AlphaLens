from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from datetime import datetime
from backend.engines.recommendations import (
    scan_for_recommendations, get_current_briefing
)
from backend.models.recommendations import WatchlistItem
from backend.db.database import get_db
import uuid

router = APIRouter()


@router.get("/briefing")
async def get_briefing():
    """Return the current daily briefing with all recommendations."""
    briefing = await get_current_briefing()
    if not briefing:
        return {
            "summary": "No briefing available yet. Click 'Scan now' to generate your first briefing.",
            "recommendations": [],
            "global_events": [],
            "trade_count": 0,
            "watch_count": 0,
            "signals_processed": 0,
            "scan_number": 0,
            "generated_at": datetime.utcnow().isoformat(),
        }
    return briefing.model_dump(mode="json")


@router.post("/scan")
async def trigger_scan(background_tasks: BackgroundTasks):
    """Manually trigger a new recommendation scan (runs in background)."""
    background_tasks.add_task(scan_for_recommendations)
    return {"status": "scan_started", "message": "Scanning global markets... check back in ~60 seconds."}


@router.get("/recommendations")
async def list_recommendations(
    type: str = None,      # trade | watch | avoid
    urgency: str = None,   # high | medium | low
    limit: int = 20
):
    """Return recommendations with optional filters."""
    try:
        db = get_db()
        query = db.table("recommendations") \
            .select("*") \
            .order("confidence", desc=True) \
            .limit(limit)
        if type:
            query = query.eq("type", type)
        if urgency:
            query = query.eq("urgency", urgency)
        result = query.execute()
        return {"recommendations": result.data}
    except Exception as e:
        return {"recommendations": [], "error": str(e)}


@router.get("/events")
async def list_global_events(limit: int = 10):
    """Return most recent global events the agent is tracking."""
    try:
        db = get_db()
        result = db.table("global_events") \
            .select("*") \
            .order("scanned_at", desc=True) \
            .limit(limit) \
            .execute()
        return {"events": result.data}
    except Exception as e:
        return {"events": []}


@router.get("/history")
async def recommendation_history(days: int = 7, limit: int = 50):
    """Return historical recommendations for tracking accuracy."""
    try:
        db = get_db()
        from datetime import timedelta
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        result = db.table("recommendations") \
            .select("*") \
            .gte("created_at", cutoff) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        return {"history": result.data}
    except Exception as e:
        return {"history": []}


# ── Watchlist endpoints ────────────────────────────────────────────────────────

@router.get("/watchlist")
async def get_watchlist(user_id: str = "default"):
    """Return user's watchlist."""
    try:
        db = get_db()
        result = db.table("watchlist") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("added_at", desc=True) \
            .execute()
        return {"watchlist": result.data}
    except Exception as e:
        return {"watchlist": []}


class WatchlistAddRequest(BaseModel):
    asset_id: str
    asset_title: str
    asset_class: str
    alert_edge_threshold: float = 5.0
    notes: str = ""


@router.post("/watchlist")
async def add_to_watchlist(req: WatchlistAddRequest, user_id: str = "default"):
    """Add an asset to the watchlist."""
    item = WatchlistItem(
        id=str(uuid.uuid4()),
        user_id=user_id,
        asset_id=req.asset_id,
        asset_title=req.asset_title,
        asset_class=req.asset_class,
        alert_edge_threshold=req.alert_edge_threshold,
        notes=req.notes,
        added_at=datetime.utcnow(),
    )
    try:
        db = get_db()
        data = item.model_dump(exclude_none=True)
        data["added_at"] = data["added_at"].isoformat()
        db.table("watchlist").insert(data).execute()
    except Exception as e:
        print(f"⚠ Watchlist add error: {e}")
    return {"status": "added", "item": item.model_dump(mode="json")}


@router.delete("/watchlist/{item_id}")
async def remove_from_watchlist(item_id: str):
    """Remove an asset from the watchlist."""
    try:
        db = get_db()
        db.table("watchlist").delete().eq("id", item_id).execute()
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "removed"}


@router.post("/recommendations/{rec_id}/outcome")
async def record_outcome(rec_id: str, outcome: dict):
    """Record the actual outcome of a recommendation for tracking accuracy."""
    try:
        db = get_db()
        db.table("recommendations").update({
            "outcome": outcome.get("result"),
            "outcome_pct": outcome.get("pct_move"),
            "outcome_recorded_at": datetime.utcnow().isoformat(),
        }).eq("id", rec_id).execute()
        return {"status": "recorded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
