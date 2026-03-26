import Layout from '../components/Layout'
import Link from 'next/link'

const PATHS = [
  { title: 'Trading basics', modules: 5, done: 0, color: '#1A6FE0',
    topics: ['What is a market price?', 'Bid, ask, and spread', 'What is edge?', 'Position sizing', 'Resolution risk'] },
  { title: 'Prediction markets', modules: 4, done: 0, color: '#3B6D11',
    topics: ['How Polymarket prices work', 'Comparing to external models', 'Liquidity and depth', 'Time to resolution'] },
  { title: 'Reading the evidence', modules: 4, done: 0, color: '#854F0B',
    topics: ['Signal taxonomy', 'Source quality scoring', 'Independence clusters', 'Syndication detection'] },
  { title: 'Crypto & on-chain', modules: 5, done: 0, color: '#3C3489',
    topics: ['On-chain metrics', 'Halving cycles', 'ETF flow analysis', 'Derivatives positioning', 'Macro correlation'] },
  { title: 'Energy & commodities', modules: 4, done: 0, color: '#993C1D',
    topics: ['OPEC+ signals', 'EIA inventory reports', 'Supply route disruption', 'Agricultural weather signals'] },
  { title: 'Geopolitics & global macro', modules: 4, done: 0, color: '#0F6E56',
    topics: ['Adversarial power signals (China, Russia)', 'BRICS+ de-dollarization', 'Conflict-to-market chains', 'Multilingual source advantage'] },
]

export default function LearnPage() {
  return (
    <Layout>
      <h1 className="text-2xl font-bold text-navy mb-2">Learning paths</h1>
      <p className="text-sm text-gray-500 mb-6">
        Adaptive curriculum — complete basics to unlock advanced modules.
        Every module ends with a quiz and links to real paper trades.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {PATHS.map((path, i) => {
          const pct = path.done / path.modules * 100
          return (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ background: path.color }} />
                <h2 className="text-base font-semibold text-navy">{path.title}</h2>
                <span className="ml-auto text-xs text-gray-500">{path.done}/{path.modules}</span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: path.color }} />
              </div>

              {/* Topics */}
              <div className="space-y-1 mb-4">
                {path.topics.map((t, j) => (
                  <div key={j} className="flex items-center gap-2 text-xs text-gray-600">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                      j < path.done ? 'border-green-500 bg-green-500' : 'border-gray-300'
                    }`}>
                      {j < path.done && <span className="text-white text-xs">✓</span>}
                    </div>
                    {t}
                  </div>
                ))}
              </div>

              <button
                className="w-full text-sm py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                style={{ borderColor: path.color, color: path.color }}
                onClick={() => alert('Full interactive learning module coming in Phase 2!')}
              >
                {path.done === 0 ? 'Start path' : 'Continue'} →
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <strong>Phase 2 feature</strong> — Interactive step-by-step lessons with quizzes are coming.
        For now, use the <Link href="/" className="underline">Scanner</Link> and{' '}
        <Link href="/scenarios" className="underline">Scenario Challenges</Link> to learn by doing.
      </div>
    </Layout>
  )
}
