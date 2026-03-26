"""
E6: Proactive Recommendations Engine
The AI agent that continuously scans global markets and surfaces
"Hey! Check out these potential trades!" opportunities.

Runs as a scheduled job every 30 minutes.
Combines news, historical data, and probability scoring into
ranked trade calls and watches.
"""
import anthropic
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from backend.models.asset import Asset
from backend.models.recommendations import (
    Recommendation, RecommendationType, UrgencyLevel, DailyBriefing
)
from backend.engines.ingestion import ingest_all_markets
from backend.engines.research import research_asset
from backend.engines.probability import score_asset
from backend.db.database import get_db, get_cache
from backend.config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

# ── System prompt for the proactive recommendation agent ──────────────────────

AGENT_SYSTEM_PROMPT = """You are the Alpha Lens proactive trading intelligence agent.

Your job: Scan a list of scored assets and identify the BEST opportunities to flag as:
1. TRADE CALL — clear edge exists, evidence is strong, act now or soon
2. WATCH — developing setup, wait for confirmation trigger before acting
3. AVOID — risk is elevated, evidence is one-sided against a position

For EACH recommendation, you must provide:
- A punchy headline (max 12 words) that sounds like a heads-up from a sharp trader
- Why the AI flagged it (3-5 specific signal bullets, not generic)
- Historical context: what happened in similar past setups?
- A clear entry trigger (for WATCH) or action (for TRADE)
- Confidence score 0-100
- Execution window: how long does the user have?
- Urgency: high (act today) | medium (this week) | low (developing, weeks)

CRITICAL RULES:
- Only flag assets where |edge| >= 5 points AND evidence_count >= 3
- Maximum 3 TRADE CALLS per briefing — be selective, not spammy
- Maximum 8 WATCHES per briefing
- Always cite the historical analog specifically (year, event, outcome)
- If no strong opportunities exist, say so — never force a recommendation
- Distinguish FAST CATALYST setups (hours to act) from SLOW BURN (weeks)
- Always include what could make you WRONG — one bear case for each trade

Return a JSON array of recommendations. Each object:
{
  "type": "trade" | "watch" | "avoid",
  "urgency": "high" | "medium" | "low",
  "title": "Short punchy headline",
  "direction": "LONG" | "SHORT" | "YES" | "NO" | "WATCH",
  "headline": "2-3 sentence explanation",
  "why": ["signal 1", "signal 2", "signal 3"],
  "historical_context": "Specific analog with year and outcome",
  "bear_case": "What could make this wrong",
  "entry_trigger": "Specific price/event that confirms the trade (for WATCH)",
  "confidence": 75,
  "window": "2-3 weeks",
  "urgency_reason": "Why this urgency level"
}

Return ONLY valid JSON array. No markdown, no preamble."""


BRIEFING_SUMMARY_PROMPT = """You are the Alpha Lens morning briefing writer.

Given today's top recommendations, write a 3-4 sentence executive summary
that sounds like a sharp trading desk's morning note. Be specific about
the key themes, not generic. Mention specific assets and edge sizes.

Example tone: "Three themes dominate today's scan: Fed mispricing (57% vs 22% CME),
energy supply tightness from dual Houthi/OPEC signals, and a developing Bitcoin 
setup waiting on $88k confirmation. The strongest single edge is the Polymarket 
Fed NO at +13 points — nine months of sticky CPI makes this the highest-conviction 
call in the briefing."

Return plain text only. 3-4 sentences max."""


GLOBAL_EVENTS_PROMPT = """You are a global market intelligence analyst for Alpha Lens.

Search the internet for the TOP 5-8 market-moving events happening RIGHT NOW
across all global regions (Middle East, Asia, Europe, Americas, Africa).

For each event, identify:
- What happened
- Which asset classes are affected (be specific: Brent, not just "oil")
- Whether it's bullish or bearish for those assets
- Urgency: is this actionable today or developing?

Return JSON array:
[{
  "title": "Event headline (max 10 words)",
  "region": "Middle East | Asia-Pacific | Europe | Americas | Africa | Global",
  "impact_level": "critical" | "high" | "medium" | "low",
  "detail": "2-3 sentences with specific data",
  "affected_assets": ["Brent Crude", "LNG Freight"],
  "direction": "bullish" | "bearish" | "mixed",
  "time_context": "Breaking | Today | This week | Developing"
}]

Only real, current events. Return ONLY valid JSON."""


async def scan_for_recommendations() -> DailyBriefing:
    """
    Main agent loop — runs every 30 minutes.
    Fetches scored assets → identifies opportunities → generates briefing.
    """
    print("→ E6: Proactive agent scanning for recommendations...")
    now = datetime.utcnow()

    # Check cache — don't regenerate more than once per 30 min
    cache = get_cache()
    cache_key = "daily_briefing:current"
    if cache:
        try:
            cached = cache.get(cache_key)
            if cached:
                data = json.loads(cached)
                briefing = DailyBriefing(**data)
                # Return cached if less than 30 min old
                age = (now - briefing.generated_at).total_seconds()
                if age < 1800:
                    print(f"✓ E6: Returning cached briefing ({int(age/60)}min old)")
                    return briefing
        except Exception:
            pass

    # 1. Get recently scored assets from DB
    assets = await get_scored_assets()

    # 2. Scan global events
    events = await scan_global_events()

    # 3. Generate recommendations
    recs = await generate_recommendations(assets, events)

    # 4. Generate executive summary
    summary = await generate_briefing_summary(recs, events)

    # 5. Assemble briefing
    briefing = DailyBriefing(
        id=hashlib.md5(now.isoformat().encode()).hexdigest()[:8],
        generated_at=now,
        summary=summary,
        recommendations=recs,
        global_events=events,
        trade_count=sum(1 for r in recs if r.type == RecommendationType.TRADE),
        watch_count=sum(1 for r in recs if r.type == RecommendationType.WATCH),
        signals_processed=len(assets) * 5,  # approximate
        scan_number=await get_scan_number(),
    )

    # 6. Store in DB and cache
    await store_briefing(briefing)
    if cache:
        try:
            cache.set(cache_key, briefing.model_dump_json(), ex=1800)
        except Exception:
            pass

    print(f"✓ E6: Generated briefing — {briefing.trade_count} trades, {briefing.watch_count} watches")
    return briefing


async def get_scored_assets(limit: int = 50) -> list[dict]:
    """Fetch recently scored assets from Supabase."""
    try:
        db = get_db()
        # Get assets scored in last 4 hours with enough evidence
        cutoff = (datetime.utcnow() - timedelta(hours=4)).isoformat()
        result = db.table("assets") \
            .select("*") \
            .gte("last_scored_at", cutoff) \
            .gte("evidence_count", 3) \
            .order("evidence_count", desc=True) \
            .limit(limit) \
            .execute()
        return result.data
    except Exception as e:
        print(f"⚠ E6 get_scored_assets error: {e}")
        return []


async def scan_global_events() -> list[dict]:
    """Use Claude with web_search to find current market-moving events."""
    if not settings.anthropic_api_key:
        return []
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=GLOBAL_EVENTS_PROMPT,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=[{
                "role": "user",
                "content": f"Today is {datetime.utcnow().strftime('%B %d, %Y')}. "
                           "What are the top 6 market-moving events happening right now globally? "
                           "Focus on: energy supply disruptions, central bank signals, "
                           "geopolitical conflicts, major economic data releases, "
                           "and commodity supply/demand developments."
            }]
        )
        for block in response.content:
            if block.type == "text" and block.text.strip():
                raw = block.text.strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                events = json.loads(raw)
                await store_events(events)
                return events
    except Exception as e:
        print(f"⚠ E6 scan_global_events error: {e}")
    return []


async def generate_recommendations(
    assets: list[dict],
    events: list[dict]
) -> list[Recommendation]:
    """Generate ranked trade recommendations from scored assets + events."""
    if not assets:
        return []

    # Build context for Claude
    asset_summary = "\n".join([
        f"- {a.get('title', 'Unknown')[:60]} | "
        f"class={a.get('asset_class')} | "
        f"AI={a.get('ai_probability', 'N/A')}% | "
        f"Mkt={a.get('market_price', 'N/A')}% | "
        f"Edge={a.get('edge', 'N/A')} pts | "
        f"Risk={a.get('resolution_risk')} | "
        f"Evidence={a.get('evidence_count', 0)} signals"
        for a in assets[:30]
    ])

    event_summary = "\n".join([
        f"- [{e.get('region')}] {e.get('title')} — "
        f"Impact: {e.get('impact_level')} — "
        f"Affects: {', '.join(e.get('affected_assets', []))}"
        for e in events[:6]
    ])

    prompt = f"""Today is {datetime.utcnow().strftime('%A, %B %d, %Y')}.

SCORED ASSETS (AI probability vs market price):
{asset_summary if asset_summary else 'No recently scored assets available.'}

CURRENT GLOBAL EVENTS:
{event_summary if event_summary else 'No events data available.'}

Identify the best trade calls and watches from this data.
Cross-reference the assets with the global events to find catalysts.
Be specific about historical analogs. Only flag genuine edges."""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=3000,
            system=AGENT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}]
        )

        for block in response.content:
            if block.type == "text" and block.text.strip():
                raw = block.text.strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]

                raw_recs = json.loads(raw)
                recs = []
                for i, r in enumerate(raw_recs):
                    # Find the matching asset
                    asset_data = next(
                        (a for a in assets
                         if any(word in a.get('title', '').lower()
                                for word in r.get('title', '').lower().split()[:3])),
                        assets[i] if i < len(assets) else {}
                    )
                    rec = Recommendation(
                        id=hashlib.md5(f"{r.get('title')}{now_str()}".encode()).hexdigest()[:10],
                        type=RecommendationType(r.get('type', 'watch')),
                        urgency=UrgencyLevel(r.get('urgency', 'medium')),
                        title=r.get('title', ''),
                        asset_id=asset_data.get('id', ''),
                        asset_title=asset_data.get('title', r.get('title', '')),
                        asset_class=asset_data.get('asset_class', ''),
                        sector=asset_data.get('sector', ''),
                        region=asset_data.get('region', ''),
                        direction=r.get('direction', 'WATCH'),
                        ai_probability=asset_data.get('ai_probability'),
                        market_price=asset_data.get('market_price'),
                        edge=asset_data.get('edge'),
                        headline=r.get('headline', ''),
                        why=r.get('why', []),
                        historical_context=r.get('historical_context', ''),
                        bear_case=r.get('bear_case', ''),
                        entry_trigger=r.get('entry_trigger', ''),
                        confidence=r.get('confidence', 60),
                        window=r.get('window', 'Unknown'),
                        urgency_reason=r.get('urgency_reason', ''),
                        sources=asset_data.get('tags', []),
                        created_at=datetime.utcnow(),
                    )
                    recs.append(rec)
                return recs
    except Exception as e:
        print(f"⚠ E6 generate_recommendations error: {e}")
    return []


async def generate_briefing_summary(
    recs: list[Recommendation],
    events: list[dict]
) -> str:
    """Generate the morning-briefing-style executive summary."""
    if not recs:
        return "No significant opportunities identified in this scan. Markets appear fairly priced across tracked assets."
    try:
        rec_text = "\n".join([
            f"- [{r.type.value.upper()}] {r.title} | Edge: {r.edge} pts | Confidence: {r.confidence}%"
            for r in recs[:5]
        ])
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            system=BRIEFING_SUMMARY_PROMPT,
            messages=[{"role": "user", "content": f"Today's recommendations:\n{rec_text}"}]
        )
        for block in response.content:
            if block.type == "text":
                return block.text.strip()
    except Exception as e:
        print(f"⚠ E6 summary error: {e}")

    # Fallback summary
    trade_calls = [r for r in recs if r.type == RecommendationType.TRADE]
    top = trade_calls[0] if trade_calls else recs[0]
    return (f"Today's scan identified {len(recs)} opportunities across "
            f"{len(set(r.asset_class for r in recs))} asset classes. "
            f"Top call: {top.title} with {top.edge:+.0f}pt edge at {top.confidence}% confidence.")


async def store_briefing(briefing: DailyBriefing):
    """Store daily briefing and recommendations in Supabase."""
    try:
        db = get_db()
        # Store briefing header
        db.table("daily_briefings").upsert({
            "id": briefing.id,
            "generated_at": briefing.generated_at.isoformat(),
            "summary": briefing.summary,
            "trade_count": briefing.trade_count,
            "watch_count": briefing.watch_count,
            "signals_processed": briefing.signals_processed,
            "scan_number": briefing.scan_number,
        }, on_conflict="id").execute()

        # Store each recommendation
        for rec in briefing.recommendations:
            data = rec.model_dump(exclude_none=True)
            for k in ["created_at"]:
                if k in data and data[k]:
                    data[k] = data[k].isoformat() if hasattr(data[k], "isoformat") else str(data[k])
            data["briefing_id"] = briefing.id
            data["type"] = data["type"].value if hasattr(data["type"], "value") else data["type"]
            data["urgency"] = data["urgency"].value if hasattr(data["urgency"], "value") else data["urgency"]
            db.table("recommendations").upsert(data, on_conflict="id").execute()

    except Exception as e:
        print(f"⚠ E6 store_briefing error: {e}")


async def store_events(events: list[dict]):
    """Store global events in Supabase."""
    try:
        db = get_db()
        for event in events:
            event["scanned_at"] = datetime.utcnow().isoformat()
            event["id"] = hashlib.md5(
                f"{event.get('title', '')}{event.get('scanned_at', '')}".encode()
            ).hexdigest()[:12]
            db.table("global_events").upsert(event, on_conflict="id").execute()
    except Exception as e:
        print(f"⚠ E6 store_events error: {e}")


async def get_scan_number() -> int:
    """Return total number of scans run."""
    try:
        db = get_db()
        result = db.table("daily_briefings").select("id", count="exact").execute()
        return (result.count or 0) + 1
    except Exception:
        return 1


def now_str() -> str:
    return datetime.utcnow().isoformat()


async def get_current_briefing() -> Optional[DailyBriefing]:
    """Get the most recent briefing (from cache or DB)."""
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
        result = db.table("daily_briefings") \
            .select("*") \
            .order("generated_at", desc=True) \
            .limit(1) \
            .execute()
        if result.data:
            briefing_data = result.data[0]
            recs_result = db.table("recommendations") \
                .select("*") \
                .eq("briefing_id", briefing_data["id"]) \
                .order("confidence", desc=True) \
                .execute()
            events_result = db.table("global_events") \
                .select("*") \
                .order("scanned_at", desc=True) \
                .limit(8) \
                .execute()
            briefing_data["recommendations"] = [
                Recommendation(**r) for r in recs_result.data
            ]
            briefing_data["global_events"] = events_result.data
            return DailyBriefing(**briefing_data)
    except Exception as e:
        print(f"⚠ E6 get_current_briefing error: {e}")
    return None
