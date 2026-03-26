import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import RecCard from '../components/RecCard'

const BASE = process.env.NEXT_PUBLIC_API_URL || ''

interface Rec {
  id: string
  type: 'trade' | 'watch' | 'avoid'
  urgency: 'high' | 'medium' | 'low'
  title: string
  asset_title: string
  asset_class: string
  sector: string
  region: string
  direction: string
  ai_probability?: number
  market_price?: number
  edge?: number
  headline: string
  why: string[]
  historical_context: string
  bear_case: string
  entry_trigger: string
  confidence: number
  window: string
  urgency_reason: string
  sources: string[]
}

interface Event {
  id: string
  title: string
  region: string
  impact_level: string
  detail: string
  affected_assets: string[]
  direction: string
  time_context: string
}

interface Briefing {
  summary: string
  recommendations: Rec[]
  global_events: Event[]
  trade_count: number
  watch_count: number
  signals_processed: number
  scan_number: number
  generated_at: string
}

const IMPACT_COLOR: Record<string, string> = {
  critical: '#A32D2D',
  high: '#854F0B',
  medium: '#3B6D11',
  low: '#5F5E5A',
}

const IMPACT_BG: Record<string, string> = {
  critical: '#FCEBEB',
  high: '#FAEEDA',
  medium: '#EAF3DE',
  low: '#F1EFE8',
}

const DIR_COLOR: Record<string, string> = {
  bullish: '#3B6D11',
  bearish: '#A32D2D',
  mixed: '#854F0B',
}

export default function BriefingPage() {
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [filter, setFilter] = useState<'all' | 'trade' | 'watch'>('all')
  const [activeTab, setActiveTab] = useState<'recs' | 'events' | 'history'>('recs')
  const [history, setHistory] = useState<Rec[]>([])
  const [lastUpdated, setLastUpdated] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/recommendations/briefing`)
      const data = await res.json()
      setBriefing(data)
      setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/recommendations/history`)
      const data = await res.json()
      setHistory(data.history || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    load()
    // Auto-refresh every 5 minutes
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (activeTab === 'history') loadHistory()
  }, [activeTab, loadHistory])

  async function triggerScan() {
    setScanning(true)
    try {
      await fetch(`${BASE}/api/recommendations/scan`, { method: 'POST' })
      // Poll for results after 60 seconds
      setTimeout(async () => {
        await load()
        setScanning(false)
      }, 60000)
    } catch {
      setScanning(false)
    }
  }

  const recs = briefing?.recommendations || []
  const filtered = filter === 'all' ? recs : recs.filter(r => r.type === filter)
  const events = briefing?.global_events || []

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-navy">Daily Intelligence Briefing</h1>
            <div className="flex items-center gap-1.5">
              <span className="live-dot" />
              <span className="text-xs text-gray-500">Agent active</span>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            AI scanning global markets 24/7 · Scan #{briefing?.scan_number || 0} ·
            Updated {lastUpdated || '—'}
          </p>
        </div>
        <button
          onClick={triggerScan}
          disabled={scanning}
          className="text-sm bg-navy text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-60 transition whitespace-nowrap"
        >
          {scanning ? 'Scanning (~60s)...' : 'Scan now'}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Trade calls', value: briefing?.trade_count ?? 0, color: 'text-accent' },
          { label: 'Watches flagged', value: briefing?.watch_count ?? 0, color: 'text-amber-700' },
          { label: 'Signals processed', value: briefing?.signals_processed ?? 0, color: 'text-navy' },
          { label: 'Total recs', value: recs.length, color: 'text-navy' },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* AI Summary card */}
      {briefing?.summary && (
        <div className="bg-navy text-white rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">AI</div>
            <span className="text-sm font-medium opacity-80">Morning briefing</span>
            <span className="text-xs opacity-50 ml-auto">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
          <p className="text-sm leading-relaxed opacity-90">{briefing.summary}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {([['recs', 'Recommendations'], ['events', 'Global events'], ['history', 'Signal history']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
              activeTab === id
                ? 'border-navy text-navy font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* RECOMMENDATIONS TAB */}
      {activeTab === 'recs' && (
        <>
          {/* Filter buttons */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-500 font-medium">Filter:</span>
            {(['all', 'trade', 'watch'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filter === f ? 'bg-navy text-white border-navy' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? `All (${recs.length})` : f === 'trade' ? `Trades (${recs.filter(r => r.type === 'trade').length})` : `Watches (${recs.filter(r => r.type === 'watch').length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-20 text-gray-400">
              <div className="animate-pulse text-lg mb-2">Scanning global markets...</div>
              <p className="text-sm">The AI agent is researching opportunities across all asset classes</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-lg mb-2">No recommendations yet</div>
              <p className="text-sm mb-4">The agent needs scored assets to analyze. Click Scan now to start.</p>
              <button onClick={triggerScan} disabled={scanning}
                className="text-sm bg-navy text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-60">
                {scanning ? 'Scanning...' : 'Run first scan'}
              </button>
            </div>
          ) : (
            filtered.map(rec => <RecCard key={rec.id} rec={rec} />)
          )}
        </>
      )}

      {/* GLOBAL EVENTS TAB */}
      {activeTab === 'events' && (
        <div>
          {events.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              No events loaded yet. Run a scan to fetch live global events.
            </div>
          ) : (
            events.map((ev, i) => (
              <div key={ev.id || i} className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: IMPACT_COLOR[ev.impact_level] || '#888' }} />
                  <span className="text-sm font-semibold text-navy flex-1">{ev.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: IMPACT_BG[ev.impact_level], color: IMPACT_COLOR[ev.impact_level] }}>
                    {ev.impact_level}
                  </span>
                  <span className="text-xs text-gray-500">{ev.time_context}</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-2">{ev.detail}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">Affects:</span>
                  {(ev.affected_assets || []).map(a => (
                    <span key={a} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{a}</span>
                  ))}
                  <span className="ml-auto text-xs font-medium"
                    style={{ color: DIR_COLOR[ev.direction] || '#888' }}>
                    {ev.direction}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[120px_1fr_120px_80px_80px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-medium">
            <div>Date</div><div>Recommendation</div><div>Direction</div><div>Confidence</div><div>Outcome</div>
          </div>
          {history.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No history yet — recommendations are tracked as they're generated.
            </div>
          ) : (
            history.map((h: any, i) => (
              <div key={h.id || i}
                className="grid grid-cols-[120px_1fr_120px_80px_80px] gap-3 px-4 py-3 border-b border-gray-100 last:border-0 text-sm items-center">
                <div className="text-xs text-gray-500">
                  {h.created_at ? new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </div>
                <div className="font-medium text-navy truncate">{h.title}</div>
                <div className={`text-xs font-medium ${h.type === 'trade' ? 'text-accent' : 'text-amber-700'}`}>
                  {h.type?.toUpperCase()} · {h.direction}
                </div>
                <div className="text-xs">{h.confidence}%</div>
                <div>
                  {h.outcome ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      h.outcome === 'win' ? 'bg-green-100 text-green-800' :
                      h.outcome === 'loss' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {h.outcome}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Tracking</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Layout>
  )
}
