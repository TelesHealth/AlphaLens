import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { getPortfolio, closeTrade, type Portfolio, type PaperTrade } from '../lib/api'

export default function PortfolioPage() {
  const [data, setData] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const p = await getPortfolio()
      setData(p)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleClose(tradeId: string, exitPrice: number) {
    setClosing(tradeId)
    try {
      await closeTrade(tradeId, exitPrice)
      await load()
    } catch (e) { console.error(e) }
    finally { setClosing(null) }
  }

  useEffect(() => { load() }, [])

  const pnlColor = (data?.total_pnl ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-navy">Paper Portfolio</h1>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">$10,000 starting balance</span>
        <div className="flex-1" />
        <button onClick={load} className="text-sm border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading portfolio...</div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard label="Balance" value={`$${(data?.balance ?? 10000).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            <StatCard label="Total P&L" value={`${(data?.total_pnl ?? 0) >= 0 ? '+' : ''}$${Math.abs(data?.total_pnl ?? 0).toFixed(2)}`} valueClass={pnlColor} />
            <StatCard label="Win rate" value={data?.trade_count ? `${data.win_rate}%` : '—'} />
            <StatCard label="Trades closed" value={String(data?.trade_count ?? 0)} />
          </div>

          {/* Open positions */}
          <div className="bg-white border border-gray-200 rounded-xl mb-5">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <h2 className="font-semibold text-navy">Open positions</h2>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {data?.open_positions?.length ?? 0}
              </span>
            </div>
            {!data?.open_positions?.length ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No open positions. Go to the Scanner to find a trade.
              </div>
            ) : (
              data.open_positions.map(t => (
                <OpenPositionRow
                  key={t.id}
                  trade={t}
                  onClose={handleClose}
                  closing={closing === t.id}
                />
              ))
            )}
          </div>

          {/* Closed trades */}
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-navy">Closed trades</h2>
            </div>
            {!data?.recent_trades?.length ? (
              <div className="text-center py-10 text-gray-400 text-sm">No closed trades yet.</div>
            ) : (
              data.recent_trades.map(t => <ClosedTradeRow key={t.id} trade={t} />)
            )}
          </div>
        </>
      )}
    </Layout>
  )
}

function StatCard({ label, value, valueClass = 'text-navy' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${valueClass}`}>{value}</div>
    </div>
  )
}

function OpenPositionRow({ trade, onClose, closing }: {
  trade: PaperTrade; onClose: (id: string, exit: number) => void; closing: boolean
}) {
  const [exitPrice, setExitPrice] = useState(trade.entry_price)

  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-navy truncate">{trade.asset_title}</div>
        <div className="text-xs text-gray-500">
          {trade.direction} · ${trade.amount} · Entry: {trade.entry_price.toFixed(1)}%
          · AI at entry: {trade.entry_ai_prob.toFixed(0)}%
          · Edge: {trade.entry_edge > 0 ? '+' : ''}{trade.entry_edge.toFixed(1)} pts
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Exit %</span>
        <input
          type="number" value={exitPrice} min={0} max={100} step={1}
          onChange={e => setExitPrice(Number(e.target.value))}
          className="w-16 border border-gray-300 rounded px-2 py-1 text-xs"
        />
        <button
          onClick={() => onClose(trade.id, exitPrice)}
          disabled={closing}
          className="text-xs bg-navy text-white px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50"
        >
          {closing ? '...' : 'Close'}
        </button>
      </div>
    </div>
  )
}

function ClosedTradeRow({ trade }: { trade: PaperTrade }) {
  const win = (trade.pnl ?? 0) > 0
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-navy truncate">{trade.asset_title}</div>
        <div className="text-xs text-gray-500">
          {trade.direction} · ${trade.amount} · {trade.asset_class}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-semibold ${win ? 'text-green-700' : 'text-red-700'}`}>
          {win ? '+' : ''}${(trade.pnl ?? 0).toFixed(2)}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${win ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {win ? 'Win' : 'Loss'}
        </span>
      </div>
    </div>
  )
}
