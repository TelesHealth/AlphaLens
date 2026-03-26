from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from backend.db.database import get_db
from backend.models.asset import Asset
from backend.engines.ingestion import ingest_all_markets
from backend.engines.research import research_asset
from backend.engines.probability import score_asset

router = APIRouter()


@router.get("/")
async def list_markets(
    asset_class: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    min_edge: Optional[float] = Query(None),
    limit: int = Query(50, le=200),
):
    """Return scored markets with optional filters."""
    try:
        db = get_db()
        query = db.table("assets").select("*").order("edge", desc=True).limit(limit)

        if asset_class:
            query = query.eq("asset_class", asset_class)
        if sector:
            query = query.eq("sector", sector)
        if region:
            query = query.eq("region", region)
        if min_edge is not None:
            query = query.gte("edge", min_edge)

        result = query.execute()
        return {"assets": result.data, "total": len(result.data)}

    except Exception as e:
        # Return demo data if DB not configured
        return {"assets": get_demo_assets(), "total": 5, "demo": True}


@router.get("/{asset_id}")
async def get_market(asset_id: str):
    """Return full detail for one asset including evidence records."""
    try:
        db = get_db()
        asset_res = db.table("assets").select("*").eq("id", asset_id).single().execute()
        evidence_res = db.table("evidence_records").select("*").eq("asset_id", asset_id)\
            .order("source_quality", desc=True).limit(10).execute()
        coach_res = db.table("coach_notes").select("*").eq("asset_id", asset_id)\
            .order("created_at", desc=True).limit(3).execute()

        return {
            "asset": asset_res.data,
            "evidence": evidence_res.data,
            "coach_notes": coach_res.data,
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")


@router.post("/refresh")
async def refresh_markets():
    """Trigger manual market refresh (admin)."""
    assets = await ingest_all_markets()
    return {"refreshed": len(assets)}


@router.post("/{asset_id}/score")
async def score_market(asset_id: str):
    """Trigger research + scoring for one asset."""
    try:
        db = get_db()
        res = db.table("assets").select("*").eq("id", asset_id).single().execute()
        asset = Asset(**res.data)
        evidence = await research_asset(asset)
        scored = await score_asset(asset, evidence)
        return {"asset_id": asset_id, "ai_probability": scored.ai_probability, "edge": scored.edge}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def get_demo_assets() -> list[dict]:
    """Demo data shown when DB is not yet configured."""
    return [
        {
            "id": "poly_demo_1", "asset_class": "polymarket",
            "title": "Will the Fed cut rates by June 2026?",
            "market_price": 57, "ai_probability": 64, "edge": 7,
            "resolution_risk": "low", "evidence_count": 6,
            "sector": "macro", "region": "us",
        },
        {
            "id": "crypto_btc", "asset_class": "crypto",
            "title": "Bitcoin (BTC)", "market_price": 85000,
            "ai_probability": None, "edge": None,
            "resolution_risk": "medium", "evidence_count": 0,
            "sector": "crypto", "region": "global",
        },
        {
            "id": "stock_spy", "asset_class": "stock",
            "title": "S&P 500 ETF (SPY)", "market_price": 560,
            "ai_probability": None, "edge": None,
            "resolution_risk": "medium", "evidence_count": 0,
            "sector": "equity", "region": "us",
        },
    ]
