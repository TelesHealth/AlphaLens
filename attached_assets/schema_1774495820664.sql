-- Alpha Lens — Supabase Schema
-- Paste this into Supabase SQL Editor and run

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

CREATE TABLE IF NOT EXISTS portfolio_state (
    id TEXT PRIMARY KEY DEFAULT 'main',
    balance DOUBLE PRECISION DEFAULT 10000
);

CREATE TABLE IF NOT EXISTS coach_notes (
    id BIGSERIAL PRIMARY KEY,
    asset_id TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO portfolio_state (id, balance) VALUES ('main', 10000)
ON CONFLICT (id) DO NOTHING;

-- ── RECOMMENDATIONS ENGINE (E6) ───────────────────────────────

CREATE TABLE IF NOT EXISTS daily_briefings (
    id TEXT PRIMARY KEY,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    summary TEXT DEFAULT '',
    trade_count INTEGER DEFAULT 0,
    watch_count INTEGER DEFAULT 0,
    signals_processed INTEGER DEFAULT 0,
    scan_number INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    briefing_id TEXT REFERENCES daily_briefings(id) ON DELETE CASCADE,
    type TEXT NOT NULL,               -- trade | watch | avoid
    urgency TEXT DEFAULT 'medium',    -- high | medium | low
    title TEXT NOT NULL,
    asset_id TEXT DEFAULT '',
    asset_title TEXT DEFAULT '',
    asset_class TEXT DEFAULT '',
    sector TEXT DEFAULT '',
    region TEXT DEFAULT '',
    direction TEXT DEFAULT 'WATCH',
    ai_probability DOUBLE PRECISION,
    market_price DOUBLE PRECISION,
    edge DOUBLE PRECISION,
    headline TEXT DEFAULT '',
    why JSONB DEFAULT '[]',
    historical_context TEXT DEFAULT '',
    bear_case TEXT DEFAULT '',
    entry_trigger TEXT DEFAULT '',
    confidence INTEGER DEFAULT 60,
    window TEXT DEFAULT '',
    urgency_reason TEXT DEFAULT '',
    sources JSONB DEFAULT '[]',
    outcome TEXT,                      -- win | loss | open | expired
    outcome_pct DOUBLE PRECISION,
    outcome_recorded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS global_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    region TEXT DEFAULT '',
    impact_level TEXT DEFAULT 'medium',
    detail TEXT DEFAULT '',
    affected_assets JSONB DEFAULT '[]',
    direction TEXT DEFAULT 'mixed',
    time_context TEXT DEFAULT '',
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default',
    asset_id TEXT NOT NULL,
    asset_title TEXT DEFAULT '',
    asset_class TEXT DEFAULT '',
    alert_edge_threshold DOUBLE PRECISION DEFAULT 5.0,
    notes TEXT DEFAULT '',
    added_at TIMESTAMPTZ DEFAULT NOW()
);
