"""
scripts/test_signal.py
Tests one complete signal pipeline: ingest → research → score → print result.
Run: python scripts/test_signal.py
"""
import sys
import os
import asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.engines.ingestion import fetch_polymarket_markets
from backend.engines.research import research_asset
from backend.engines.probability import score_asset
from backend.config import settings


async def main():
    print("=== Alpha Lens — End-to-End Signal Test ===\n")

    # Check keys
    if not settings.anthropic_api_key:
        print("⚠ ANTHROPIC_API_KEY not set — add to Replit Secrets")
        return

    # 1. Fetch one market
    print("[1/3] Fetching Polymarket markets...")
    markets = await fetch_polymarket_markets(limit=5)
    if not markets:
        print("⚠ No markets fetched — check network connection")
        return

    asset = markets[0]
    print(f"✓ Got: {asset.title}")
    print(f"  Market price: {asset.market_price}%\n")

    # 2. Research it
    print("[2/3] Running research agent (Claude API)...")
    evidence = await research_asset(asset)
    print(f"✓ Found {len(evidence)} evidence records:")
    for e in evidence[:3]:
        arrow = "↑" if e.direction == "supports_yes" else "↓" if e.direction == "supports_no" else "→"
        print(f"  {arrow} [{e.source}] {e.claim[:80]}...")
    if len(evidence) > 3:
        print(f"  ... and {len(evidence) - 3} more\n")

    # 3. Score it
    print("[3/3] Scoring with probability engine...")
    scored = await score_asset(asset, evidence)
    print(f"\n{'='*50}")
    print(f"RESULT: {scored.title[:60]}")
    print(f"  Market price:    {scored.market_price:.1f}%")
    print(f"  AI probability:  {scored.ai_probability:.1f}%")
    print(f"  Confidence band: {scored.confidence_low:.1f}% – {scored.confidence_high:.1f}%")
    print(f"  Edge:            {scored.edge:+.1f} pts")
    print(f"  Resolution risk: {scored.resolution_risk}")
    print(f"  Evidence count:  {scored.evidence_count}")
    print(f"{'='*50}")

    if scored.edge and abs(scored.edge) >= 5:
        print(f"\n✓ TRADEABLE EDGE DETECTED ({scored.edge:+.1f} pts)")
    else:
        print(f"\n— Edge below threshold — no trade signal")

    print("\n✓ Test complete — pipeline is working!")


if __name__ == "__main__":
    asyncio.run(main())
