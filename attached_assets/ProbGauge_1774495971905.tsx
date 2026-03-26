interface Props {
  aiProb: number
  marketPrice: number
  confidenceLow?: number
  confidenceHigh?: number
  assetClass?: string
}

export default function ProbGauge({ aiProb, marketPrice, confidenceLow, confidenceHigh, assetClass }: Props) {
  const edge = aiProb - marketPrice
  const isPolymarket = assetClass === 'polymarket'

  // SVG arc math
  const r = 72
  const cx = 100
  const cy = 100
  const circumference = Math.PI * r  // half circle
  const offset = circumference * (1 - aiProb / 100)

  const needleAngle = (aiProb / 100) * 180 - 90

  const gaugeColor = aiProb >= 60 ? '#3B6D11' : aiProb >= 40 ? '#1A6FE0' : '#A32D2D'

  return (
    <div>
      <div className="text-xs text-gray-500 text-center mb-2 font-medium">
        {isPolymarket ? 'AI probability (YES)' : 'AI outlook score'}
      </div>

      {/* SVG Gauge */}
      <div className="relative" style={{ height: 120 }}>
        <svg width="200" height="120" viewBox="0 0 200 120" className="mx-auto block">
          {/* Background track */}
          <path
            d={`M 28 100 A 72 72 0 0 1 172 100`}
            fill="none" stroke="#E5E7EB" strokeWidth="14" strokeLinecap="round"
          />
          {/* Red zone */}
          <path d={`M 28 100 A 72 72 0 0 1 64 35`}
            fill="none" stroke="#FCA5A5" strokeWidth="14" strokeLinecap="round" opacity="0.6" />
          {/* Amber zone */}
          <path d={`M 64 35 A 72 72 0 0 1 136 35`}
            fill="none" stroke="#FCD34D" strokeWidth="14" strokeLinecap="round" opacity="0.6" />
          {/* Green zone */}
          <path d={`M 136 35 A 72 72 0 0 1 172 100`}
            fill="none" stroke="#86EFAC" strokeWidth="14" strokeLinecap="round" opacity="0.6" />
          {/* Active arc */}
          <path
            d={`M 28 100 A 72 72 0 ${aiProb > 50 ? 1 : 0} 1 ${
              100 + 72 * Math.cos(Math.PI - (aiProb / 100) * Math.PI)
            } ${
              100 - 72 * Math.sin((aiProb / 100) * Math.PI)
            }`}
            fill="none"
            stroke={gaugeColor}
            strokeWidth="14"
            strokeLinecap="round"
            style={{ transition: 'all 0.8s ease' }}
          />
          {/* Needle */}
          <line
            x1={cx} y1={cy}
            x2={cx + 60 * Math.cos((needleAngle * Math.PI) / 180)}
            y2={cy + 60 * Math.sin((needleAngle * Math.PI) / 180)}
            stroke="#1A1A2E" strokeWidth="2.5" strokeLinecap="round"
            style={{ transformOrigin: `${cx}px ${cy}px`, transition: 'all 0.8s ease' }}
          />
          <circle cx={cx} cy={cy} r="5" fill="#1A1A2E" />

          {/* Zone labels */}
          <text x="20" y="114" fontSize="9" fill="#A32D2D" fontFamily="sans-serif">Bear</text>
          <text x="94" y="22" fontSize="9" fill="#92400E" fontFamily="sans-serif">50%</text>
          <text x="167" y="114" fontSize="9" fill="#3B6D11" fontFamily="sans-serif" textAnchor="end">Bull</text>
        </svg>

        {/* Center label */}
        <div className="absolute inset-x-0 text-center" style={{ bottom: 6 }}>
          <div className="text-3xl font-bold" style={{ color: gaugeColor }}>
            {aiProb.toFixed(0)}%
          </div>
          {confidenceLow != null && (
            <div className="text-xs text-gray-500">
              {confidenceLow.toFixed(0)}% – {confidenceHigh?.toFixed(0)}%
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-gray-500 mb-0.5">Market price</div>
          <div className="text-base font-semibold text-navy">
            {isPolymarket ? `${marketPrice.toFixed(0)}%` : `$${marketPrice.toFixed(2)}`}
          </div>
        </div>
        <div className={`rounded-lg p-2.5 text-center ${
          edge > 5 ? 'bg-green-50' : edge < -5 ? 'bg-red-50' : 'bg-gray-50'
        }`}>
          <div className="text-xs text-gray-500 mb-0.5">Edge</div>
          <div className={`text-base font-semibold ${
            edge > 5 ? 'text-green-700' : edge < -5 ? 'text-red-700' : 'text-gray-700'
          }`}>
            {edge > 0 ? '+' : ''}{edge.toFixed(1)} pts
          </div>
        </div>
      </div>

      {/* Edge verdict */}
      <div className={`mt-2 text-xs text-center py-1.5 rounded-lg font-medium ${
        Math.abs(edge) >= 5
          ? 'bg-green-100 text-green-800'
          : Math.abs(edge) >= 3
            ? 'bg-amber-100 text-amber-800'
            : 'bg-gray-100 text-gray-600'
      }`}>
        {Math.abs(edge) >= 5 ? 'Tradeable edge detected'
          : Math.abs(edge) >= 3 ? 'Marginal edge — wait for confirmation'
          : 'No significant edge — consider skipping'}
      </div>
    </div>
  )
}
