from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # AI
    anthropic_api_key: str = ""

    # Database
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    database_url: str = ""

    # Cache
    upstash_redis_url: str = ""
    upstash_redis_token: str = ""

    # Polymarket
    polymarket_api_key: str = ""
    polymarket_secret: str = ""
    polymarket_passphrase: str = ""

    # Market data
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    coingecko_api_key: str = ""
    newsapi_key: str = ""

    # App
    app_env: str = "development"
    paper_balance_default: float = 10000.0
    min_edge_threshold: float = 5.0
    max_position_pct: float = 0.05

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
