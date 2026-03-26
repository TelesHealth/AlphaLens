"""
E1: Market Ingestion Engine
Pulls markets from Polymarket, crypto prices, and stock data.
Normalizes everything into the unified Asset schema.
"""
import httpx
import asyncio
from datetime import datetime
from backend.models.asset import Asset, AssetClass, RiskLevel
from backend.db.database import get_db, get_cache
from backend.config import settings
import json


POLYMARKET_GAMMA = "https://gamma-api.polymarket.com"
COINGECKO_BASE = "https://api.coingecko.com/api/v3"


async def fetch_polymarket_markets(limit: int = 50) -> list[Asset]:
    """Fetch active markets from Polymarket Gamma API."""
    assets = []
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(
                f"{POLYMARKET_GAMMA}/markets",
                params={"active": "true", "limit": limit, "order": "volume", "ascending": "false"}
            )
            resp.raise_for_status()
            markets = resp.json()

            for m in markets:
                # Get best YES price as market probability
                outcomes = m.get("outcomePrices", "[]")
                if isinstance(outcomes, str):
                    try:
                        outcomes = json.loads(outcomes)
                    except Exception:
                        outcomes = []

                market_price = 50.0
                if outcomes and len(outcomes) > 0:
                    try:
                        market_price = float(outcomes[0]) * 100
                    except (ValueError, TypeError):
                        pass

                asset = Asset(
                    id=f"poly_{m.get('id', '')}",
                    asset_class=AssetClass.POLYMARKET,
                    title=m.get("question", m.get("title", "Unknown")),
                    description=m.get("description", ""),
                    resolution_rules=m.get("resolution_rules", ""),
                    market_price=round(market_price, 2),
                    source_url=f"https://polymarket.com/event/{m.get('slug', '')}",
                    tags=m.get("tags", []) if isinstance(m.get("tags"), list) else [],
                    sector="prediction",
                    last_scored_at=datetime.utcnow(),
                )
                assets.append(asset)
        except Exception as e:
            print(f"⚠ Polymarket fetch error: {e}")

    return assets


async def fetch_crypto_prices() -> list[Asset]:
    """Fetch top crypto assets from CoinGecko."""
    assets = []
    coins = [
        ("bitcoin", "BTC", "Bitcoin"),
        ("ethereum", "ETH", "Ethereum"),
        ("solana", "SOL", "Solana"),
        ("binancecoin", "BNB", "BNB"),
    ]

    async with httpx.AsyncClient(timeout=30) as client:
        for coin_id, ticker, name in coins:
            try:
                params = {"ids": coin_id, "vs_currencies": "usd",
                          "include_24hr_change": "true"}
                if settings.coingecko_api_key:
                    params["x_cg_demo_api_key"] = settings.coingecko_api_key

                resp = await client.get(f"{COINGECKO_BASE}/simple/price", params=params)
                resp.raise_for_status()
                data = resp.json().get(coin_id, {})
                price = data.get("usd", 0)
                change = data.get("usd_24h_change", 0)

                asset = Asset(
                    id=f"crypto_{ticker.lower()}",
                    asset_class=AssetClass.CRYPTO,
                    title=f"{name} ({ticker})",
                    description=f"{name} — live price and AI signal scoring",
                    market_price=round(price, 2),
                    source_url=f"https://coingecko.com/en/coins/{coin_id}",
                    tags=["crypto", ticker.lower()],
                    sector="crypto",
                    region="global",
                    last_scored_at=datetime.utcnow(),
                )
                assets.append(asset)
                await asyncio.sleep(0.5)  # CoinGecko rate limit
            except Exception as e:
                print(f"⚠ CoinGecko {coin_id} error: {e}")

    return assets


async def fetch_stock_data() -> list[Asset]:
    """Fetch key stock indices and equities via yfinance."""
    assets = []
    tickers = [
        ("SPY", "S&P 500 ETF", "stock", "us"),
        ("QQQ", "NASDAQ 100 ETF", "stock", "us"),
        ("GLD", "Gold ETF (GLD)", "commodity", "global"),
        ("USO", "Oil ETF (USO)", "commodity", "global"),
    ]

    try:
        import yfinance as yf
        for ticker, name, sector, region in tickers:
            try:
                t = yf.Ticker(ticker)
                hist = t.history(period="1d")
                if not hist.empty:
                    price = float(hist["Close"].iloc[-1])
                    asset = Asset(
                        id=f"stock_{ticker.lower()}",
                        asset_class=AssetClass.STOCK,
                        title=f"{name} ({ticker})",
                        description=f"{name} — live price tracking",
                        market_price=round(price, 2),
                        source_url=f"https://finance.yahoo.com/quote/{ticker}",
                        tags=[sector, ticker.lower()],
                        sector=sector,
                        region=region,
                        last_scored_at=datetime.utcnow(),
                    )
                    assets.append(asset)
            except Exception as e:
                print(f"⚠ yfinance {ticker} error: {e}")
    except ImportError:
        print("⚠ yfinance not installed")

    return assets


async def ingest_all_markets() -> list[Asset]:
    """Run all ingestion sources and return combined asset list."""
    print("→ E1: Starting market ingestion...")
    results = await asyncio.gather(
        fetch_polymarket_markets(30),
        fetch_crypto_prices(),
        fetch_stock_data(),
        return_exceptions=True
    )

    all_assets = []
    for r in results:
        if isinstance(r, list):
            all_assets.extend(r)
        elif isinstance(r, Exception):
            print(f"⚠ Ingestion error: {r}")

    print(f"✓ E1: Ingested {len(all_assets)} assets")

    # Store in Supabase
    await store_assets(all_assets)
    return all_assets


async def store_assets(assets: list[Asset]):
    """Upsert assets into Supabase."""
    try:
        db = get_db()
        for asset in assets:
            data = asset.model_dump(exclude_none=True)
            # Convert datetime to ISO string
            for key in ["last_scored_at", "created_at"]:
                if key in data and data[key]:
                    data[key] = data[key].isoformat()
            db.table("assets").upsert(data, on_conflict="id").execute()
    except Exception as e:
        print(f"⚠ Store assets error: {e}")
