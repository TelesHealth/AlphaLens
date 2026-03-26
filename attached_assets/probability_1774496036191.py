"""
E3: Probability Engine
Combines evidence records into calibrated AI probability scores.
"""
import anthropic
import json
from datetime import datetime
from backend.models.asset import Asset, EvidenceRecord
from backend.db.database import get_db, get_cache
from backend.config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)


SCORING_SYSTEM_PROMPT = """You are a calibrated probability forecaster for Alpha Lens.

Given a market/asset and its evidence records, output a JSON object:
{
  "ai_probability": <float 0-100>,
  "confidence_low": <float 0-100>,
  "confidence_high": <float 0-100>,
  "bull_weight": <float 0-1, average weight of bullish signals>,
  "bear_weight": <float 0-1, average weight of bearish signals>,
  "signal_count": <int>,
  "dominant_theme": <string, 1 sentence>,
  "resolution_risk": "low" | "medium" | "high",
  "coach_summary": <string, 2-3 sentences explaining the probability for a trader>
}

Rules:
- For prediction markets: probability is P(YES resolution)
- For crypto/stocks: probability is P(price up significantly in next 30 days)
- Weight evidence by source_quality * freshness
- Deduplicate by independence_cluster (don't double-count syndicated stories)
- Always output valid JSON only. No markdown."""


def calculate_base_probability(asset: Asset, records: list[EvidenceRecord]) -> dict:
    """Calculate weighted probability from evidence records."""
    if not records:
        return {
            "ai_probability": asset.market_price,
            "confidence_low": max(0, asset.market_price - 10),
            "confidence_high": min(100, asset.market_price + 10),
            "edge": 0,
            "signal_count": 0,
        }

    # Weight each record
    bull_score = 0.0
    bear_score = 0.0
    total_weight = 0.0
    seen_clusters = set()

    for r in records:
        # Skip duplicate clusters (keep first/highest quality already deduped)
        if r.independence_cluster and r.independence_cluster in seen_clusters:
            continue
        if r.independence_cluster:
            seen_clusters.add(r.independence_cluster)

        weight = r.source_quality * r.freshness
        if r.direction == "supports_yes":
            bull_score += weight
        elif r.direction == "supports_no":
            bear_score += weight
        total_weight += weight

    if total_weight == 0:
        prob = asset.market_price
    else:
        # Blend base rate (market price) with evidence
        evidence_prob = (bull_score / total_weight) * 100
        prob = 0.4 * asset.market_price + 0.6 * evidence_prob

    prob = max(5, min(95, prob))
    edge = round(prob - asset.market_price, 1)

    return {
        "ai_probability": round(prob, 1),
        "confidence_low": round(max(5, prob - 8), 1),
        "confidence_high": round(min(95, prob + 8), 1),
        "edge": edge,
        "signal_count": len(records),
    }


async def score_asset(asset: Asset, records: list[EvidenceRecord]) -> Asset:
    """Score an asset using evidence records and Claude calibration."""
    base = calculate_base_probability(asset, records)

    # Use Claude for final calibration if we have API key and evidence
    coach_summary = ""
    if settings.anthropic_api_key and records:
        try:
            evidence_summary = "\n".join([
                f"- [{r.direction}] {r.source} ({r.source_quality:.0%} quality): {r.claim}"
                for r in records[:8]
            ])

            prompt = f"""Market: {asset.title}
Asset class: {asset.asset_class}
Market price: {asset.market_price}%
Base AI probability from evidence weighting: {base['ai_probability']}%

Evidence records:
{evidence_summary}

Calibrate the final probability and provide coach summary."""

            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=500,
                system=SCORING_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}]
            )

            for block in response.content:
                if block.type == "text":
                    raw = block.text.strip()
                    if raw.startswith("```"):
                        raw = raw.split("```")[1]
                        if raw.startswith("json"):
                            raw = raw[4:]
                    scored = json.loads(raw)
                    base["ai_probability"] = scored.get("ai_probability", base["ai_probability"])
                    base["confidence_low"] = scored.get("confidence_low", base["confidence_low"])
                    base["confidence_high"] = scored.get("confidence_high", base["confidence_high"])
                    coach_summary = scored.get("coach_summary", "")
                    asset.resolution_risk = scored.get("resolution_risk", "medium")
                    break
        except Exception as e:
            print(f"⚠ E3 Claude calibration error: {e}")

    # Update asset
    asset.ai_probability = base["ai_probability"]
    asset.confidence_low = base["confidence_low"]
    asset.confidence_high = base["confidence_high"]
    asset.edge = round(base["ai_probability"] - asset.market_price, 1)
    asset.evidence_count = base["signal_count"]
    asset.last_scored_at = datetime.utcnow()

    # Store updated asset
    try:
        db = get_db()
        data = {
            "id": asset.id,
            "ai_probability": asset.ai_probability,
            "confidence_low": asset.confidence_low,
            "confidence_high": asset.confidence_high,
            "edge": asset.edge,
            "evidence_count": asset.evidence_count,
            "resolution_risk": asset.resolution_risk,
            "last_scored_at": asset.last_scored_at.isoformat(),
        }
        db.table("assets").upsert(data, on_conflict="id").execute()

        if coach_summary:
            db.table("coach_notes").insert({
                "asset_id": asset.id,
                "note": coach_summary,
                "created_at": datetime.utcnow().isoformat(),
            }).execute()
    except Exception as e:
        print(f"⚠ E3 store error: {e}")

    return asset
