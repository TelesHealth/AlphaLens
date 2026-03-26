"""
E2: Research Agent
Uses Claude API with web_search to research each market
and extract structured evidence records.
"""
import anthropic
import json
import hashlib
from datetime import datetime
from backend.models.asset import Asset, EvidenceRecord
from backend.db.database import get_db, get_cache
from backend.config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)


EVIDENCE_SYSTEM_PROMPT = """You are a financial research agent for Alpha Lens, an AI investment intelligence platform.

Your job: Research a given market/asset and extract structured evidence records.

For each piece of evidence you find, output a JSON object with:
- source: publication name
- source_url: URL if available
- published_at: ISO date string (estimate if not found)
- claim: one-sentence factual claim from the source
- direction: "supports_yes" | "supports_no" | "neutral" (relative to the market question)
- source_quality: 0.0-1.0 (0.9+ = official/primary, 0.7-0.9 = major news, 0.5-0.7 = analyst, <0.5 = social/opinion)
- freshness: 0.0-1.0 (1.0 = today, 0.8 = this week, 0.6 = this month)
- independence_cluster: short string grouping syndicated stories (e.g. "fed_jan_2026_speech")
- signal_type: "macro" | "structured" | "news" | "analyst" | "onchain" | "filing" | "geopolitical"
- decay_speed: "slow" | "medium" | "fast"

Return a JSON array of 4-8 evidence records. No markdown, no preamble. Only valid JSON array."""


def generate_search_plan(asset: Asset) -> str:
    """Generate targeted search queries based on asset type."""
    base = asset.title

    if asset.asset_class == "polymarket":
        return f"""Research this prediction market: "{base}"
Resolution rules: {asset.resolution_rules[:300] if asset.resolution_rules else 'Standard market rules'}
Search for: recent news, official data, expert forecasts, and market signals relevant to whether this resolves YES or NO.
Focus on: primary sources, official statements, quantitative data. Flag syndicated news."""

    elif asset.asset_class == "crypto":
        return f"""Research the current outlook for {base}.
Search for: on-chain data, ETF flows, regulatory news, macro correlation signals, technical levels.
Focus on: Glassnode metrics, derivatives positioning, institutional activity, macro risk signals."""

    elif asset.asset_class in ["stock", "commodity"]:
        return f"""Research the current outlook for {base}.
Search for: recent earnings/price data, analyst estimates, sector news, geopolitical supply signals.
Focus on: primary filings, official releases, supply chain data."""

    else:
        return f"Research current market signals and news for: {base}"


async def research_asset(asset: Asset) -> list[EvidenceRecord]:
    """Run Claude research agent on a single asset."""
    if not settings.anthropic_api_key:
        print("⚠ No ANTHROPIC_API_KEY — skipping research")
        return []

    # Check cache first
    cache = get_cache()
    cache_key = f"research:{asset.id}"
    if cache:
        try:
            cached = cache.get(cache_key)
            if cached:
                raw = json.loads(cached)
                return [EvidenceRecord(**r) for r in raw]
        except Exception:
            pass

    search_prompt = generate_search_plan(asset)

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=EVIDENCE_SYSTEM_PROMPT,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=[{"role": "user", "content": search_prompt}]
        )

        # Extract text from response
        evidence_json = ""
        for block in response.content:
            if block.type == "text":
                evidence_json = block.text.strip()
                break

        if not evidence_json:
            return []

        # Parse JSON
        if evidence_json.startswith("```"):
            evidence_json = evidence_json.split("```")[1]
            if evidence_json.startswith("json"):
                evidence_json = evidence_json[4:]

        raw_records = json.loads(evidence_json)
        records = []

        for r in raw_records:
            record = EvidenceRecord(
                id=hashlib.md5(f"{asset.id}:{r.get('claim', '')}".encode()).hexdigest(),
                asset_id=asset.id,
                source=r.get("source", "Unknown"),
                source_url=r.get("source_url", ""),
                claim=r.get("claim", ""),
                direction=r.get("direction", "neutral"),
                source_quality=float(r.get("source_quality", 0.5)),
                freshness=float(r.get("freshness", 0.5)),
                independence_cluster=r.get("independence_cluster", asset.id),
                signal_type=r.get("signal_type", "news"),
                decay_speed=r.get("decay_speed", "medium"),
                created_at=datetime.utcnow(),
            )
            records.append(record)

        # Deduplicate by independence cluster (keep highest quality per cluster)
        records = deduplicate_by_cluster(records)

        # Cache for 1 hour
        if cache and records:
            try:
                cache.set(cache_key, json.dumps([r.model_dump(mode="json") for r in records]), ex=3600)
            except Exception:
                pass

        # Store in DB
        store_evidence(records)

        print(f"✓ E2: Researched {asset.title[:50]} — {len(records)} evidence records")
        return records

    except json.JSONDecodeError as e:
        print(f"⚠ E2 JSON parse error for {asset.id}: {e}")
        return []
    except Exception as e:
        print(f"⚠ E2 research error for {asset.id}: {e}")
        return []


def deduplicate_by_cluster(records: list[EvidenceRecord]) -> list[EvidenceRecord]:
    """Keep only highest-quality record per independence cluster."""
    clusters: dict[str, EvidenceRecord] = {}
    for r in records:
        key = r.independence_cluster or r.source
        if key not in clusters or r.source_quality > clusters[key].source_quality:
            clusters[key] = r
    return list(clusters.values())


def store_evidence(records: list[EvidenceRecord]):
    """Store evidence records in Supabase."""
    try:
        db = get_db()
        for r in records:
            data = r.model_dump(exclude_none=True)
            for key in ["published_at", "created_at"]:
                if key in data and data[key]:
                    data[key] = data[key].isoformat() if hasattr(data[key], "isoformat") else str(data[key])
            db.table("evidence_records").upsert(data, on_conflict="id").execute()
    except Exception as e:
        print(f"⚠ Store evidence error: {e}")
