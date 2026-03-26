import Link from 'next/link'
import clsx from 'clsx'
import { type Asset } from '../lib/api'

const CLASS_BADGE: Record<string, string> = {
  polymarket: 'bg-purple-100 text-purple-800',
  crypto:     'bg-amber-100 text-amber-800',
  stock:      'bg-blue-100 text-blue-800',
  commodity:  'bg-green-100 text-green-800',
  forex:      'bg-teal-100 text-teal-800',
  real_estate:'bg-pink-100 text-pink-800',
}

const RISK_BADGE: Record<string, string> = {
  low:     'bg-green-100 text-green-800',
  medium:  'bg-amber-100 text-amber-800',
  high:    'bg-red-100 text-red-800',
  extreme: 'bg-red-200 text-red-900',
}

interface Props {
  asset: Asset
  onRefresh?: () => void
}

export default function MarketRow({ asset, onRefresh }: Props) {
  const edge = asset.edge ?? null
  const hasScore = asset.ai_probability != null

  return (
    <div className="grid grid-cols-[2fr_80px_80px_80px_90px_100px] gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center">

      {/* Title + badges */}
      <div className="min-w-0">
        <Link
          href={`/market/${encodeURIComponent(asset.id)}`}
          className="text-sm font-medium text-navy hover:underline line-clamp-2 leading-snug"
        >
          {asset.title}
        </Link>
        <div className="flex gap-1.5 mt-1 flex-wrap">
          <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium',
            CLASS_BADGE[asset.asset_class] || 'bg-gray-100 text-gray-700')}>
            {asset.asset_class}
          </span>
          {asset.sector && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              {asset.sector}
            </span>
          )}
          {asset.evidence_count ? (
            <span className="text-xs text-gray-400">{asset.evidence_count} signals</span>
          ) : null}
        </div>
      </div>

      {/* AI probability */}
      <div className="text-center">
        {hasScore ? (
          <div>
            <div className="text-sm font-semibold text-navy">
              {asset.ai_probability!.toFixed(0)}%
            </div>
            {asset.confidence_low != null && (
              <div className="text-xs text-gray-400">
                {asset.confidence_low.toFixed(0)}–{asset.confidence_high?.toFixed(0)}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>

      {/* Market price */}
      <div className="text-center text-sm text-gray-700">
        {asset.asset_class === 'polymarket'
          ? `${asset.market_price.toFixed(0)}%`
          : asset.market_price > 999
            ? `$${(asset.market_price / 1000).toFixed(1)}k`
            : `$${asset.market_price.toFixed(2)}`}
      </div>

      {/* Edge */}
      <div className="text-center">
        {edge != null ? (
          <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full',
            edge > 5 ? 'edge-pos' : edge < -5 ? 'edge-neg' : 'edge-flat')}>
            {edge > 0 ? '+' : ''}{edge.toFixed(1)} pts
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>

      {/* Resolution risk */}
      <div className="text-center">
        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
          RISK_BADGE[asset.resolution_risk || 'medium'])}>
          {asset.resolution_risk || 'medium'}
        </span>
      </div>

      {/* Action */}
      <div className="text-right flex gap-1.5 justify-end">
        <Link
          href={`/market/${encodeURIComponent(asset.id)}`}
          className="text-xs border border-gray-300 px-2.5 py-1 rounded hover:bg-gray-100 transition-colors"
        >
          Detail
        </Link>
        {hasScore && edge != null && Math.abs(edge) >= 5 && (
          <Link
            href={`/market/${encodeURIComponent(asset.id)}?trade=1`}
            className="text-xs bg-navy text-white px-2.5 py-1 rounded hover:opacity-90 transition-opacity"
          >
            Trade
          </Link>
        )}
      </div>
    </div>
  )
}
