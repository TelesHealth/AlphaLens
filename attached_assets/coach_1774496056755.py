from fastapi import APIRouter
from pydantic import BaseModel
import anthropic
from backend.config import settings
from backend.db.database import get_db

router = APIRouter()
client = anthropic.Anthropic(api_key=settings.anthropic_api_key)


class CoachRequest(BaseModel):
    asset_id: str
    asset_title: str
    market_price: float
    ai_probability: float
    edge: float
    direction: str = ""
    evidence_summary: str = ""


COACH_PROMPT = """You are the Alpha Lens AI trading coach. A user is looking at a trade.

Provide a 3-4 sentence coaching note covering:
1. Whether the edge justifies a trade (>5pts = yes, 3-5 = marginal, <3 = skip)
2. The quality of the evidence driving the AI probability
3. What the user should watch for before/after entering
4. One specific risk to this trade

Be direct and specific. No generic advice. Speak like a sharp experienced trader."""


@router.post("/analyze")
async def analyze_trade(req: CoachRequest):
    """Generate AI coach analysis for a potential trade."""
    if not settings.anthropic_api_key:
        return {"note": "Add ANTHROPIC_API_KEY to Replit Secrets to enable AI coaching."}

    prompt = f"""Asset: {req.asset_title}
Market price: {req.market_price}%
AI probability: {req.ai_probability}%
Edge: {req.edge:+.1f} pts
Direction considered: {req.direction or 'not decided'}
Evidence: {req.evidence_summary[:500] if req.evidence_summary else 'No evidence loaded yet'}

Give me your coaching note."""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            system=COACH_PROMPT,
            messages=[{"role": "user", "content": prompt}]
        )
        note = response.content[0].text
        return {"note": note, "asset_id": req.asset_id}
    except Exception as e:
        return {"note": f"Coach unavailable: {e}", "asset_id": req.asset_id}


@router.get("/notes/{asset_id}")
async def get_coach_notes(asset_id: str):
    """Return stored coach notes for an asset."""
    try:
        db = get_db()
        res = db.table("coach_notes").select("*")\
            .eq("asset_id", asset_id)\
            .order("created_at", desc=True)\
            .limit(5).execute()
        return {"notes": res.data}
    except Exception:
        return {"notes": []}
