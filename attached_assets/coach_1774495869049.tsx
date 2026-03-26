import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import { getMarkets, getCoachAnalysis, type Asset } from '../lib/api'

export default function CoachPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [selected, setSelected] = useState<Asset | null>(null)
  const [coaching, setCoaching] = useState(false)
  const [feed, setFeed] = useState<{ text: string; type: string; time: string }[]>([])
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getMarkets({ limit: '20' }).then(d => {
      const scored = (d.assets || []).filter(a => a.ai_probability != null)
      setAssets(scored)
      if (scored.length) setSelected(scored[0])
    }).catch(console.error)
  }, [])

  async function runCoach(asset: Asset) {
    setCoaching(true)
    const time = new Date().toLocaleTimeString()
    setFeed(f => [{ text: `Analyzing: ${asset.title}...`, type: 'system', time }, ...f])

    try {
      const res = await getCoachAnalysis({
        asset_id: asset.id,
        asset_title: asset.title,
        market_price: asset.market_price,
        ai_probability: asset.ai_probability ?? asset.market_price,
        edge: asset.edge ?? 0,
      })
      setFeed(f => [{ text: res.note, type: 'coach', time }, ...f])
    } catch (e: any) {
      setFeed(f => [{ text: `Error: ${e.message}`, type: 'error', time }, ...f])
    } finally {
      setCoaching(false)
    }
  }

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-navy">Live Probability Coach</h1>
        <div className="flex items-center gap-1.5">
          <span className="live-dot" />
          <span className="text-xs text-gray-500">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-6">
        {/* Market selector */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-navy">
            Select market
          </div>
          {assets.length === 0 ? (
            <div className="p-4 text-xs text-gray-500 text-center">
              No scored markets yet. Go to Scanner → Re-score AI on a market first.
            </div>
          ) : (
            assets.map(a => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 transition-colors ${
                  selected?.id === a.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="text-xs font-medium text-navy line-clamp-2 mb-1">{a.title}</div>
                <div className="flex gap-2">
                  <span className="text-xs text-gray-500">AI: {a.ai_probability?.toFixed(0)}%</span>
                  <span className={`text-xs font-medium ${(a.edge ?? 0) > 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {(a.edge ?? 0) > 0 ? '+' : ''}{(a.edge ?? 0).toFixed(1)} pts
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Coach panel */}
        <div>
          {selected && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="text-base font-semibold text-navy mb-1">{selected.title}</div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {[
                      { label: 'AI probability', value: `${selected.ai_probability?.toFixed(0)}%` },
                      { label: 'Market price', value: `${selected.market_price.toFixed(0)}%` },
                      { label: 'Edge', value: `${(selected.edge ?? 0) > 0 ? '+' : ''}${(selected.edge ?? 0).toFixed(1)} pts` },
                    ].map(s => (
                      <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-500 mb-0.5">{s.label}</div>
                        <div className="text-base font-bold text-navy">{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => runCoach(selected)}
                  disabled={coaching}
                  className="text-sm bg-navy text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                >
                  {coaching ? 'Analyzing...' : 'Get coaching'}
                </button>
              </div>
            </div>
          )}

          {/* Feed */}
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-navy">
              Coach feed
            </div>
            <div ref={feedRef} className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {feed.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Select a market and click "Get coaching" to start.
                </div>
              ) : (
                feed.map((f, i) => (
                  <div key={i} className={`rounded-lg p-3 text-sm slide-in ${
                    f.type === 'coach' ? 'bg-blue-50 border-l-4 border-blue-500'
                    : f.type === 'error' ? 'bg-red-50 border-l-4 border-red-400'
                    : 'bg-gray-50 border-l-4 border-gray-300'
                  }`}>
                    <div className="text-xs text-gray-500 mb-1.5">
                      {f.type === 'coach' ? 'AI Coach' : f.type === 'system' ? 'System' : 'Error'} · {f.time}
                    </div>
                    <div className="text-gray-700 leading-relaxed">{f.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
