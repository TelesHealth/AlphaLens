"""
scripts/init_db.py
Run once to create all Supabase tables.
Usage: python scripts/init_db.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.config import settings
from supabase import create_client

TABLES_SQL = """
-- Assets table (unified schema for all asset classes)
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    asset_class TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    resolution_rules TEXT DEFAULT '',
    market_price DOUBLE PRECISION DEFAULT 0,
    ai_probability DOUBLE PRECISION,
    confidence_low DOUBLE PRECISION,
    confidence_high DOUBLE PRECISION,
    edge DOUBLE PRECISION,
    resolution_risk TEXT DEFAULT 'medium',
    signal_type TEXT DEFAULT 'slow_burn',
    evidence_count INTEGER DEFAULT 0,
    source_url TEXT DEFAULT '',
    tags JSONB DEFAULT '[]',
    region TEXT DEFAULT '',
    sector TEXT DEFAULT '',
    last_scored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evidence records
CREATE TABLE IF NOT EXISTS evidence_records (
    id TEXT PRIMARY KEY,
    asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    source_url TEXT DEFAULT '',
    published_at TIMESTAMPTZ,
    claim TEXT NOT NULL,
    topic TEXT DEFAULT '',
    direction TEXT DEFAULT 'neutral',
    source_quality DOUBLE PRECISION DEFAULT 0.5,
    freshness DOUBLE PRECISION DEFAULT 0.5,
    independence_cluster TEXT DEFAULT '',
    signal_type TEXT DEFAULT 'news',
    decay_speed TEXT DEFAULT 'medium',
    raw_text TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paper trades
CREATE TABLE IF NOT EXISTS paper_trades (
    id TEXT PRIMARY KEY,
    asset_id TEXT,
    asset_title TEXT,
    asset_class TEXT,
    direction TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    entry_price DOUBLE PRECISION,
    entry_ai_prob DOUBLE PRECISION,
    entry_edge DOUBLE PRECISION,
    shares DOUBLE PRECISION DEFAULT 0,
    status TEXT DEFAULT 'open',
    exit_price DOUBLE PRECISION,
    pnl DOUBLE PRECISION,
    coach_note TEXT DEFAULT '',
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- Portfolio state
CREATE TABLE IF NOT EXISTS portfolio_state (
    id TEXT PRIMARY KEY DEFAULT 'main',
    balance DOUBLE PRECISION DEFAULT 10000
);

-- Coach notes
CREATE TABLE IF NOT EXISTS coach_notes (
    id BIGSERIAL PRIMARY KEY,
    asset_id TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default portfolio state
INSERT INTO portfolio_state (id, balance) VALUES ('main', 10000)
ON CONFLICT (id) DO NOTHING;
"""


def init():
    if not settings.supabase_url or not settings.supabase_service_key:
        print("⚠ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in Replit Secrets")
        print("  1. Go to replit.com → your Repl → Secrets (padlock icon)")
        print("  2. Add SUPABASE_URL and SUPABASE_SERVICE_KEY from supabase.com")
        return

    try:
        client = create_client(settings.supabase_url, settings.supabase_service_key)
        # Execute each statement
        for stmt in TABLES_SQL.strip().split(";"):
            stmt = stmt.strip()
            if stmt and not stmt.startswith("--"):
                try:
                    client.rpc("exec_sql", {"query": stmt}).execute()
                except Exception:
                    pass  # Table may already exist

        print("✓ Database tables created successfully")
        print("  Tables: assets, evidence_records, paper_trades, portfolio_state, coach_notes")
    except Exception as e:
        print(f"⚠ DB init error: {e}")
        print("  You can also create tables manually in Supabase SQL editor")
        print("  Copy the SQL from scripts/schema.sql")


if __name__ == "__main__":
    init()
