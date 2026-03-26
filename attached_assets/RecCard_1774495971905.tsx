import { useState } from 'react'
import { useRouter } from 'next/router'

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

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string; border: string }> = {
  trade: { bg: '#EEF4FF', text: '#1A6FE0', label: 'TRADE CALL', border: '#1A6FE0' },
  watch: { bg: '#FAEEDA', text: '#854F0B', label: 'WATCH', border: '#BA7517' },
  avoid: { bg: '#FCEBEB', text: '#A32D2D', label: 'AVOID', border: '#E24B4A' },
}

const URGENCY_STRIPE: Record<string, string> = {
  high: 'border-t-2 border-t-red-500',
  medium: 'border-t-2 border-t-amber-500',
  low: 'border-t-2 border-t-green-500',
}

export default function RecCard({ rec }: { rec: Rec }) {
  const [expanded, setExpanded] = useState(false)
  const [watchAdded, setWatchAdded] = useState(false)
  const router = useRouter()

  const ts = TYPE_STYLES[rec.type] || TYPE_STYLES.watch
  const edgeColor = (rec.edge ?? 0) > 0 ? '#3B6D11' : (rec.edge ?? 0) < 0 ? '#A32D2D' : '#5F5E5A'
  const confColor = rec.confidence >= 75 ? '#3B6D11' : rec.confidence >= 60 ? '#BA7517' : '#A32D2D'
  const edgeStr = rec.edge != null ? `${rec.edge > 0 ? '+' : ''}${rec.edge.toFixed(1)} pts` : '—'

  async function addToWatchlist() {
    const BASE = process.env.NEXT_PUBLIC_API_URL || ''
    try {
      await fetch(`${BASE}/api/recommendations/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: rec.id,
          asset_title: rec.asset_title || rec.title,
          asset_class: rec.asset_class,
          alert_edge_threshold: 5,
          notes: rec.title,
        }),
      })
      setWatchAdded(true)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl mb-4 overflow-hidden ${URGENCY_STRIPE[rec.urgency]}`}
      style={{ borderLeft: `3px solid ${ts.border}` }}
    >
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex gap-2 flex-wrap mb-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: ts.bg, color: ts.text }}>
                {ts.label}
              </span>
              {rec.urgency === 'high' && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  Act today
                </span>
              )}
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{rec.asset_class}</span>
              {rec.sector && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{rec.sector}</span>}
              {rec.region && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{rec.region}</span>}
            </div>
            <h3 className="text-base font-semibold text-navy leading-snug">{rec.title}</h3>
            {rec.asset_title && rec.asset_title !== rec.title && (
              <p className="text-xs text-gray-500 mt-0.5">{rec.asset_title}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-2xl font-bold" style={{ color: edgeColor }}>{edgeStr}</div>
            <div className="text-xs text-gray-400">edge</div>
          </div>
        </div>

        {/* Headline */}
        <p className="text-sm text-gray-600 leading-relaxed mb-3">{rec.headline}</p>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: 'AI prob', value: rec.ai_probability != null ? `${rec.ai_probability.toFixed(0)}%` : '—' },
            { label: 'Market', value: rec.market_price != null ? `${rec.market_price.toFixed(0)}%` : '—' },
            { label: 'Confidence', value: `${rec.confidence}%`, color: confColor },
            { label: 'Window', value: rec.window || '—' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500 mb-0.5">{s.label}</div>
              <div className="text-sm font-semibold" style={{ color: s.color || '#0F2B5B' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Why signals — top 3 */}
        {rec.why?.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-medium text-gray-500 mb-1.5">Why the AI flagged this</div>
            {rec.why.slice(0, expanded ? undefined : 3).map((w, i) => (
              <div key={i} className="flex gap-2 text-xs text-gray-600 py-1 border-b border-gray-100 last:border-0">
                <span style={{ color: edgeColor }}>→</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="space-y-3 mt-2">
            {rec.historical_context && (
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-xs font-medium text-blue-700 mb-1">Historical analog</div>
                <p className="text-xs text-blue-900 leading-relaxed">{rec.historical_context}</p>
              </div>
            )}
            {rec.bear_case && (
              <div className="bg-red-50 rounded-lg p-3">
                <div className="text-xs font-medium text-red-700 mb-1">Bear case — what could be wrong</div>
                <p className="text-xs text-red-900 leading-relaxed">{rec.bear_case}</p>
              </div>
            )}
            {rec.entry_trigger && (
              <div className="bg-amber-50 rounded-lg p-3">
                <div className="text-xs font-medium text-amber-700 mb-1">Entry trigger (for WATCH)</div>
                <p className="text-xs text-amber-900 leading-relaxed">{rec.entry_trigger}</p>
              </div>
            )}
            {rec.urgency_reason && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-600 mb-1">Why this urgency</div>
                <p className="text-xs text-gray-700 leading-relaxed">{rec.urgency_reason}</p>
              </div>
            )}
            {rec.sources?.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Sources</div>
                <div className="flex flex-wrap gap-1.5">
                  {rec.sources.map(s => (
                    <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {expanded ? 'Show less ↑' : 'Show more ↓'}
          </button>
          <div className="flex-1" />
          {rec.asset_class === 'polymarket' && rec.type === 'trade' && (
            <span className="text-xs text-gray-400">Non-US only</span>
          )}
          <button
            onClick={addToWatchlist}
            disabled={watchAdded}
            className="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {watchAdded ? 'Watching ✓' : '+ Watchlist'}
          </button>
          {rec.type === 'trade' && (
            <button
              onClick={() => router.push(`/market/${encodeURIComponent(rec.asset_id || rec.id)}?trade=1`)}
              className="text-xs bg-navy text-white px-3 py-1.5 rounded hover:opacity-90"
            >
              Paper trade →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
