"""
Background jobs — runs inside FastAPI via APScheduler.
No separate worker process needed on Replit.
"""
from backend.engines.ingestion import ingest_all_markets
from backend.engines.research import research_asset
from backend.engines.probability import score_asset
from backend.engines.recommendations import scan_for_recommendations
from backend.db.database import get_db
import asyncio


async def fetch_all_markets():
    """E1: Fetch fresh market data every 15 minutes."""
    print("-> Job: fetch_all_markets starting...")
    try:
        assets = await ingest_all_markets()
        print(f"✓ Job: fetch_all_markets complete — {len(assets)} assets")
    except Exception as e:
        print(f"⚠ Job: fetch_all_markets error: {e}")


async def run_research_agent():
    """E2+E3: Research and score top markets every hour."""
    print("-> Job: run_research_agent starting...")
    try:
        db = get_db()
        from datetime import datetime, timedelta
        cutoff = (datetime.utcnow() - timedelta(hours=1)).isoformat()
        res = db.table("assets").select("*") \
            .lt("last_scored_at", cutoff) \
            .order("market_price", desc=True) \
            .limit(10).execute()

        from backend.models.asset import Asset
        for asset_data in res.data:
            asset = Asset(**asset_data)
            evidence = await research_asset(asset)
            await score_asset(asset, evidence)
            await asyncio.sleep(2)

        print(f"✓ Job: run_research_agent complete — {len(res.data)} assets scored")
    except Exception as e:
        print(f"⚠ Job: run_research_agent error: {e}")


async def run_recommendations_scan():
    """
    E6: Proactive recommendations agent — runs every 30 minutes.
    Scans global markets and surfaces trade calls + watches.
    """
    print("-> Job: run_recommendations_scan starting...")
    try:
        briefing = await scan_for_recommendations()
        print(
            f"✓ Job: recommendations complete — "
            f"{briefing.trade_count} trades, {briefing.watch_count} watches, "
            f"scan #{briefing.scan_number}"
        )
    except Exception as e:
        print(f"⚠ Job: run_recommendations_scan error: {e}")
