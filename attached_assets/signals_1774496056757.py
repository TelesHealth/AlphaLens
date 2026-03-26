from fastapi import APIRouter
from backend.db.database import get_db

router = APIRouter()


@router.get("/{asset_id}")
async def get_signals(asset_id: str, limit: int = 20):
    """Return evidence records for an asset."""
    try:
        db = get_db()
        res = db.table("evidence_records").select("*")\
            .eq("asset_id", asset_id)\
            .order("source_quality", desc=True)\
            .limit(limit).execute()
        return {"signals": res.data}
    except Exception:
        return {"signals": [], "demo": True}


@router.get("/feed/latest")
async def get_signal_feed(limit: int = 50):
    """Return most recent signals across all assets."""
    try:
        db = get_db()
        res = db.table("evidence_records").select("*")\
            .order("created_at", desc=True)\
            .limit(limit).execute()
        return {"signals": res.data}
    except Exception:
        return {"signals": []}
