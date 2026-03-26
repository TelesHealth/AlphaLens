import { useState } from 'react'
import { getCoachAnalysis, type Asset, type Evidence, type CoachNote } from '../lib/api'

interface Props {
  asset: Asset
  evidence: Evidence[]
  storedNotes: CoachNote[]
}

export default function CoachPanel({ asset, evidence, storedNotes }: Props) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [dir, setDir] = useState<'YES' | 'NO' | ''>('')

  const latestStored = storedNotes[0]?.note || ''

  async function analyze() {
    setLoading(true)
    setNote('')
    try {
      const evidenceSummary = evidence.slice(0, 5)
        .map(e => `[${e.direction}] ${e.source}: ${e.claim}`)
        .join('\n')

      const res = await getCoachAnalysis({
        asset_id: asset.id,
        asset_title: asset.title,
        market_price: asset.market_price,
        ai_probability: asset.ai_probability ?? asset.market_price,
        edge: asset.edge ?? 0,
        direction: dir,
        evidence_summary: evidenceSummary,
      })
      setNote(res.note)
    } catch (e: any) {
      setNote(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-semibold">
          AI
        </div>
        <span className="text-sm font-semibold text-navy">Coach</span>
      </div>

      {/* Direction selector */}
      <div className="flex gap-2 mb-3">
        {['YES', 'NO', ''].map(d => (
          <button
            key={d}
            onClick={() => setDir(d as any)}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              dir === d
                ? d === 'YES' ? 'bg-green-100 border-green-500 text-green-800 font-medium'
                  : d === 'NO' ? 'bg-red-100 border-red-500 text-red-800 font-medium'
                  : 'bg-gray-200 border-gray-400 text-gray-700 font-medium'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {d === '' ? 'Undecided' : d === 'YES' ? 'Buy YES' : 'Buy NO'}
          </button>
        ))}
      </div>

      <button
        onClick={analyze}
        disabled={loading}
        className="w-full text-sm bg-navy text-white py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition mb-3"
      >
        {loading ? 'Coach is analyzing...' : 'Get coach analysis'}
      </button>

      {/* Live note */}
      {note && (
        <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-3 text-sm text-gray-700 leading-relaxed mb-3 slide-in">
          <div className="text-xs font-medium text-blue-700 mb-1">AI Coach</div>
          {note}
        </div>
      )}

      {/* Stored note */}
      {!note && latestStored && (
        <div className="bg-gray-50 border-l-4 border-gray-300 rounded-r-lg p-3 text-sm text-gray-600 leading-relaxed">
          <div className="text-xs font-medium text-gray-500 mb-1">Last analysis</div>
          {latestStored}
        </div>
      )}

      {!note && !latestStored && (
        <div className="text-xs text-gray-400 text-center py-2">
          Click above to get a personalized coaching note
        </div>
      )}
    </div>
  )
}
