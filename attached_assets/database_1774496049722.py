from supabase import create_client, Client
from backend.config import settings
import httpx

_client: Client | None = None


def get_db() -> Client:
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


async def init_db():
    """Run on startup — verify connection and create tables if missing."""
    if not settings.supabase_url:
        print("⚠ No SUPABASE_URL set — running without database")
        return
    try:
        db = get_db()
        # Test connection
        db.table("assets").select("id").limit(1).execute()
        print("✓ Database connected")
    except Exception as e:
        print(f"⚠ Database init warning: {e}")
        print("  Run scripts/init_db.py to create tables")


def get_cache():
    """Return Upstash Redis client or None if not configured."""
    if not settings.upstash_redis_url:
        return None
    try:
        from upstash_redis import Redis
        return Redis(url=settings.upstash_redis_url, token=settings.upstash_redis_token)
    except Exception:
        return None
