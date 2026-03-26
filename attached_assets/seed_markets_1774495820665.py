"""
scripts/seed_markets.py
Fetches initial markets from Polymarket and seeds the database.
Run once after init_db.py: python scripts/seed_markets.py
"""
import sys
import os
import asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.engines.ingestion import ingest_all_markets


async def main():
    print("=== Alpha Lens — Seeding Markets ===")
    print("Fetching from Polymarket, CoinGecko, Yahoo Finance...")
    assets = await ingest_all_markets()
    print(f"\n✓ Seeded {len(assets)} assets into database")
    print("\nBreakdown:")
    from collections import Counter
    counts = Counter(a.asset_class for a in assets)
    for cls, n in counts.items():
        print(f"  {cls}: {n}")
    print("\nNext: open the app and click 'Re-score AI' on any market to run the research agent.")


if __name__ == "__main__":
    asyncio.run(main())
