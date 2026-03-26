import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import MarketRow from '../components/MarketRow'
import { getMarkets, type Asset } from '../lib/api'

const CLASSES = ['All', 'polymarket', 'crypto', 'stock', 'commodity']
const SECTORS = ['All', 'macro', 'crypto', 'equity', 'energy', 'prediction']

export default function Scanner() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [demo, setDemo] = useState(false)
  const [classFilter, setClassFilter] = useState('All')
  const [sectorFilter, setSectorFilter] = useState('All')
  const [minEdge, setMinEdge] = useState(0)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = {}
      if (classFilter !== 'All') params.asset_class = classFilter
      if (sectorFilter !== 'All') params.sector = sectorFilter
      if (minEdge > 0) params.min_edge = String(minEdge)
      const data = await getMarkets(params)
      setAssets(data.assets || [])
      setDemo(!!data.demo)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [classFilter, sectorFilter, minEdge])

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Market Scanner</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            AI-scored signals across Polymarket, crypto, stocks, and commodities
          </p>
        </div>
        <div className="flex-1" />
        <button
          onClick={load}
          className="text-sm border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {demo && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Demo mode</strong> — Add Supabase and API keys in Replit Secrets to load live data.{' '}
          <a href="/setup" className="underline">Setup guide →</a>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Class:</span>
          <div className="flex gap-1">
            {CLASSES.map(c => (
              <button
                key={c}
                onClick={() => setClassFilter(c)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  classFilter === c
                    ? 'bg-navy text-white border-navy'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Sector:</span>
          <div className="flex gap-1 flex-wrap">
            {SECTORS.map(s => (
              <button
                key={s}
                onClick={() => setSectorFilter(s)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  sectorFilter === s
                    ? 'bg-navy text-white border-navy'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Min edge:</span>
          <select
            value={minEdge}
            onChange={e => setMinEdge(Number(e.target.value))}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            <option value={0}>Any</option>
            <option value={3}>3+ pts</option>
            <option value={5}>5+ pts</option>
            <option value={10}>10+ pts</option>
          </select>
        </div>
      </div>

      {/* Table header */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[2fr_80px_80px_80px_90px_100px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-medium">
          <div>Market / Asset</div>
          <div className="text-center">AI prob</div>
          <div className="text-center">Market</div>
          <div className="text-center">Edge</div>
          <div className="text-center">Risk</div>
          <div className="text-right">Action</div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            <div className="animate-pulse">Loading markets...</div>
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No markets found. Try adjusting filters.
          </div>
        ) : (
          assets.map(asset => (
            <MarketRow key={asset.id} asset={asset} onRefresh={load} />
          ))
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center">
        {assets.length} assets shown · Updates every 15 min · Not financial advice
      </p>
    </Layout>
  )
}
