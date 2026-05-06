const BASE = import.meta.env.VITE_API_URL || ''

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

// ── Markets ──────────────────────────────────────────────────
export const getMarkets = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return req<{ assets: Asset[]; total: number; demo?: boolean }>(`/api/markets${qs}`)
}

export const getMarket = (id: string) =>
  req<{ asset: Asset; evidence: Evidence[]; coach_notes: CoachNote[] }>(`/api/markets/${id}`)

export const scoreMarket = (id: string) =>
  req(`/api/markets/${id}/score`, { method: 'POST' })

export const refreshMarkets = () =>
  req('/api/markets/refresh', { method: 'POST' })

// ── Portfolio ─────────────────────────────────────────────────
export const getPortfolio = () =>
  req<Portfolio>('/api/portfolio/')

export const openTrade = (trade: OpenTradePayload) =>
  req('/api/portfolio/trade', { method: 'POST', body: JSON.stringify(trade) })

export const closeTrade = (trade_id: string, exit_price: number) =>
  req('/api/portfolio/close', { method: 'POST', body: JSON.stringify({ trade_id, exit_price }) })

// ── Signals ───────────────────────────────────────────────────
export const getSignals = (assetId: string) =>
  req<{ signals: Evidence[] }>(`/api/signals/${assetId}`)

export const getSignalFeed = () =>
  req<{ signals: Evidence[] }>('/api/signals/feed/latest')

// ── Coach ─────────────────────────────────────────────────────
export const getCoachAnalysis = (payload: CoachPayload) =>
  req<{ note: string }>('/api/coach/analyze', { method: 'POST', body: JSON.stringify(payload) })

// ── Types ─────────────────────────────────────────────────────
export interface Asset {
  id: string
  asset_class: string
  title: string
  description?: string
  resolution_rules?: string
  market_price: number
  ai_probability?: number
  confidence_low?: number
  confidence_high?: number
  edge?: number
  resolution_risk?: string
  signal_type?: string
  evidence_count?: number
  source_url?: string
  tags?: string[]
  region?: string
  sector?: string
  last_scored_at?: string
}

export interface Evidence {
  id: string
  asset_id: string
  source: string
  source_url?: string
  published_at?: string
  claim: string
  direction: 'supports_yes' | 'supports_no' | 'neutral'
  source_quality: number
  freshness: number
  independence_cluster?: string
  signal_type?: string
  decay_speed?: string
}

export interface CoachNote {
  id: number
  asset_id: string
  note: string
  created_at: string
}

export interface Portfolio {
  balance: number
  total_pnl: number
  win_rate: number
  trade_count: number
  open_positions: PaperTrade[]
  recent_trades: PaperTrade[]
  demo?: boolean
}

export interface PaperTrade {
  id: string
  asset_id: string
  asset_title: string
  asset_class: string
  direction: string
  amount: number
  entry_price: number
  entry_ai_prob: number
  entry_edge: number
  status: string
  pnl?: number
  opened_at: string
  closed_at?: string
}

export interface OpenTradePayload {
  asset_id: string
  asset_title: string
  asset_class: string
  direction: string
  amount: number
  market_price: number
  ai_probability: number
}

export interface CoachPayload {
  asset_id: string
  asset_title: string
  market_price: number
  ai_probability: number
  edge: number
  direction?: string
  evidence_summary?: string
}
