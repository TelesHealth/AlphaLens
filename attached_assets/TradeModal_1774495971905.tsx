import { useState } from 'react'
import { openTrade, type Asset } from '../lib/api'
import { useRouter } from 'next/router'

interface Props {
  asset: Asset
  onClose: () => void
}

export default function TradeModal({ asset, onClose }: Props) {
  const router = useRouter()
  const [dir, setDir] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState(200)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const edge = (asset.ai_probability ?? asset.market_price) - asset.market_price
  const effectiveEdge = dir === 'YES' ? edge : -edge
  const hasEdge = Math.abs(effectiveEdge) >= 5

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      await openTrade({
        asset_id: asset.id,
        asset_title: asset.title,
        asset_class: asset.asset_class,
        direction: dir,
        amount,
        market_price: asset.market_price,
        ai_probability: asset.ai_probability ?? asset.market_price,
      })
      setDone(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        {done ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✓</div>
            <h3 className="text-lg font-bold text-navy mb-1">Trade opened</h3>
            <p className="text-sm text-gray-500 mb-4">
              {dir} on {asset.title.slice(0, 50)}... — ${amount}
            </p>
            <div className="flex gap-2">
              <button onClick={() => router.push('/portfolio')}
                className="flex-1 text-sm bg-navy text-white py-2 rounded-lg hover:opacity-90">
                View portfolio
              </button>
              <button onClick={onClose}
                className="flex-1 text-sm border border-gray-300 py-2 rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-base font-bold text-navy mb-1">Paper trade</h3>
            <p className="text-xs text-gray-500 mb-4 line-clamp-2">{asset.title}</p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <Stat label="AI prob" value={`${(asset.ai_probability ?? 0).toFixed(0)}%`} />
              <Stat label="Market" value={`${asset.market_price.toFixed(0)}%`} />
              <Stat label="Edge" value={`${edge > 0 ? '+' : ''}${edge.toFixed(1)}`}
                color={edge > 5 ? 'text-green-700' : edge < -5 ? 'text-red-700' : 'text-gray-700'} />
            </div>

            {/* Direction */}
            <div className="mb-4">
              <div className="text-xs text-gray-500 font-medium mb-2">Direction</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDir('YES')}
                  className={`py-2 rounded-lg text-sm font-medium border transition ${
                    dir === 'YES' ? 'bg-green-100 border-green-500 text-green-800' : 'border-gray-300 text-gray-600'
                  }`}
                >
                  Buy YES / Long
                </button>
                <button
                  onClick={() => setDir('NO')}
                  className={`py-2 rounded-lg text-sm font-medium border transition ${
                    dir === 'NO' ? 'bg-red-100 border-red-500 text-red-800' : 'border-gray-300 text-gray-600'
                  }`}
                >
                  Buy NO / Short
                </button>
              </div>
            </div>

            {/* Amount */}
            <div className="mb-4">
              <div className="text-xs text-gray-500 font-medium mb-2">Amount ($)</div>
              <input
                type="number"
                value={amount}
                min={10}
                max={2000}
                step={50}
                onChange={e => setAmount(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex gap-2 mt-2">
                {[100, 200, 500].map(v => (
                  <button key={v} onClick={() => setAmount(v)}
                    className="text-xs border border-gray-300 px-2 py-1 rounded hover:bg-gray-50">
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {/* Edge warning */}
            {!hasEdge && (
              <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                Edge &lt; 5 pts in this direction — marginal trade. Consider waiting.
              </div>
            )}

            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={onClose}
                className="flex-1 text-sm border border-gray-300 py-2 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 text-sm bg-navy text-white py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Opening...' : `Open ${dir} — $${amount}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color = 'text-navy' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  )
}
