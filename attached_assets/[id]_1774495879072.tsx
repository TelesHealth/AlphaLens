import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '../../components/Layout'
import ProbGauge from '../../components/ProbGauge'
import CoachPanel from '../../components/CoachPanel'
import TradeModal from '../../components/TradeModal'
import { getMarket, scoreMarket, type Asset, type Evidence, type CoachNote } from '../../lib/api'

export default function MarketDetail() {
  const router = useRouter()
  const { id, trade } = router.query
  const assetId = typeof id === 'string' ? decodeURIComponent(id) : ''

  const [asset, setAsset] = useState<Asset | null>(null)
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [coachNotes, setCoachNotes] = useState<CoachNote[]>([])
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [tradeOpen, setTradeOpen] = useState(false)

  useEffect(() => {
    if (!assetId) return
    setLoading(true)
    getMarket(assetId)
      .then(data => {
        setAsset(data.asset as unknown as Asset)
        setEvidence(data.evidence || [])
        setCoachNotes(data.coach_notes || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))

    if (trade === '1') setTradeOpen(true)
  }, [assetId, trade])

  async function handleScore() {
    if (!assetId) return
    setScoring(true)
    try {
      await scoreMarket(assetId)
      const data = await getMarket(assetId)
      setAsset(data.asset as unknown as Asset)
      setEvidence(data.evidence || [])
      setCoachNotes(data.coach_notes || [])
    } catch (e) {
      console.error(e)
    } finally {
      setScoring(false)
    }
  }

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
    </Layout>
  )

  if (!asset) return (
    <Layout>
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">Asset not found</p>
        <Link href="/" className="text-accent underline">Back to scanner</Link>
      </div>
    </Layout>
  )

  const hasScore = asset.ai_probability != null
  const edge = asset.edge ?? 0

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:underline">Scanner</Link>
        <span className="mx-2">›</span>
        <span className="text-navy">{asset.title.slice(0, 60)}...</span>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-6">
        {/* LEFT COLUMN */}
        <div>
          {/* Title card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="flex-1">
                <h1 className="text-xl font-bold text-navy mb-2">{asset.title}</h1>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {asset.asset_class}
                  </span>
                  {asset.sector && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {asset.sector}
                    </span>
                  )}
                  {asset.region && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                      {asset.region}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleScore}
                  disabled={scoring}
                  className="text-sm border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  {scoring ? 'Scoring...' : 'Re-score AI'}
                </button>
                {hasScore && (
                  <button
                    onClick={() => setTradeOpen(true)}
                    className="text-sm bg-navy text-white px-3 py-1.5 rounded hover:opacity-90"
                  >
                    Paper Trade
                  </button>
                )}
              </div>
            </div>

            {asset.description && (
              <p className="text-sm text-gray-600 leading-relaxed">{asset.description}</p>
            )}

            {asset.resolution_rules && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-xs font-medium text-gray-500 mb-1">Resolution rules</div>
                <p className="text-xs text-gray-600 leading-relaxed">{asset.resolution_rules}</p>
              </div>
            )}
          </div>

          {/* Evidence records */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-base font-semibold text-navy">Evidence signals</h2>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {evidence.length} records
              </span>
            </div>

            {evidence.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                No evidence yet.{' '}
                <button onClick={handleScore} className="underline text-accent">
                  Click Re-score AI
                </button>{' '}
                to research this market.
              </div>
            ) : (
              <div className="space-y-3">
                {evidence.map((ev, i) => (
                  <EvidenceCard key={ev.id || i} ev={ev} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* Probability gauge */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <ProbGauge
              aiProb={asset.ai_probability ?? asset.market_price}
              marketPrice={asset.market_price}
              confidenceLow={asset.confidence_low}
              confidenceHigh={asset.confidence_high}
              assetClass={asset.asset_class}
            />
          </div>

          {/* AI Coach */}
          <CoachPanel asset={asset} evidence={evidence} storedNotes={coachNotes} />
        </div>
      </div>

      {/* Trade modal */}
      {tradeOpen && asset && (
        <TradeModal asset={asset} onClose={() => setTradeOpen(false)} />
      )}
    </Layout>
  )
}

function EvidenceCard({ ev }: { ev: Evidence }) {
  const dirColor = ev.direction === 'supports_yes'
    ? 'border-l-green-500 bg-green-50'
    : ev.direction === 'supports_no'
      ? 'border-l-red-500 bg-red-50'
      : 'border-l-gray-300 bg-gray-50'

  const qualityPct = Math.round(ev.source_quality * 100)
  const freshPct = Math.round(ev.freshness * 100)

  return (
    <div className={`border-l-4 rounded-r-lg p-3 ${dirColor}`}>
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-xs font-semibold text-gray-700">{ev.source}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
          ev.direction === 'supports_yes' ? 'bg-green-200 text-green-800'
          : ev.direction === 'supports_no' ? 'bg-red-200 text-red-800'
          : 'bg-gray-200 text-gray-700'
        }`}>
          {ev.direction === 'supports_yes' ? '↑ YES' : ev.direction === 'supports_no' ? '↓ NO' : '— neutral'}
        </span>
        <span className="text-xs text-gray-500">Quality: {qualityPct}%</span>
        <span className="text-xs text-gray-500">Fresh: {freshPct}%</span>
        {ev.decay_speed && (
          <span className="text-xs text-gray-500">{ev.decay_speed} decay</span>
        )}
      </div>
      <p className="text-sm text-gray-700 leading-snug">{ev.claim}</p>
      {ev.source_url && (
        <a href={ev.source_url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-accent underline mt-1 inline-block">
          Source →
        </a>
      )}
    </div>
  )
}
