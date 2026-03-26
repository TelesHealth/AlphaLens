import Layout from '../components/Layout'

const SECRETS = [
  { key: 'ANTHROPIC_API_KEY',      where: 'console.anthropic.com',  required: true,  desc: 'Powers AI scoring and coach' },
  { key: 'SUPABASE_URL',           where: 'supabase.com → project settings', required: true, desc: 'Database URL' },
  { key: 'SUPABASE_ANON_KEY',      where: 'supabase.com → API keys', required: true, desc: 'Public anon key' },
  { key: 'SUPABASE_SERVICE_KEY',   where: 'supabase.com → API keys', required: true, desc: 'Service role key (secret)' },
  { key: 'UPSTASH_REDIS_URL',      where: 'upstash.com → database → REST URL', required: false, desc: 'API response cache' },
  { key: 'UPSTASH_REDIS_TOKEN',    where: 'upstash.com → database → REST token', required: false, desc: 'Cache auth token' },
  { key: 'COINGECKO_API_KEY',      where: 'coingecko.com/api', required: false, desc: 'Higher rate limits for crypto data' },
  { key: 'ALPACA_API_KEY',         where: 'alpaca.markets', required: false, desc: 'US stocks live data + paper trading' },
  { key: 'ALPACA_SECRET_KEY',      where: 'alpaca.markets', required: false, desc: 'Alpaca secret' },
  { key: 'NEWSAPI_KEY',            where: 'newsapi.org', required: false, desc: 'News article feed' },
  { key: 'POLYMARKET_API_KEY',     where: 'polymarket.com/builders', required: false, desc: 'Live trading (non-US only)' },
]

const STEPS = [
  {
    n: 1, title: 'Create Supabase project',
    detail: 'Go to supabase.com → New project (free tier). Copy your Project URL, anon key, and service key into Replit Secrets.',
    link: 'https://supabase.com'
  },
  {
    n: 2, title: 'Run the database schema',
    detail: "In your Supabase dashboard → SQL Editor → paste the contents of scripts/schema.sql and click Run. This creates all 5 tables.",
    link: null
  },
  {
    n: 3, title: 'Add secrets to Replit',
    detail: 'In Replit: click the padlock icon in the left sidebar → add each secret from the table below.',
    link: null
  },
  {
    n: 4, title: 'Install frontend dependencies',
    detail: 'In Replit shell: cd frontend && npm install && cd ..',
    link: null
  },
  {
    n: 5, title: 'Click Run',
    detail: 'Hit the green Run button. The app installs Python deps, builds the frontend, and starts on port 8000.',
    link: null
  },
  {
    n: 6, title: 'Seed initial markets',
    detail: 'In the shell: python scripts/seed_markets.py — this fetches 30 Polymarket markets and seeds your database.',
    link: null
  },
]

export default function SetupPage() {
  return (
    <Layout>
      <h1 className="text-2xl font-bold text-navy mb-2">Setup guide</h1>
      <p className="text-sm text-gray-500 mb-6">
        Get Alpha Lens running end-to-end on Replit in about 10 minutes.
      </p>

      {/* Steps */}
      <div className="bg-white border border-gray-200 rounded-xl mb-6">
        {STEPS.map((s, i) => (
          <div key={s.n} className={`flex gap-4 p-4 ${i < STEPS.length - 1 ? 'border-b border-gray-100' : ''}`}>
            <div className="w-7 h-7 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              {s.n}
            </div>
            <div>
              <div className="text-sm font-semibold text-navy mb-1">{s.title}</div>
              <div className="text-sm text-gray-600">{s.detail}</div>
              {s.link && (
                <a href={s.link} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-accent underline mt-1 inline-block">
                  Open →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Secrets table */}
      <h2 className="text-lg font-semibold text-navy mb-3">Required secrets</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="grid grid-cols-[200px_80px_1fr_1fr] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-medium">
          <div>Secret name</div>
          <div>Required</div>
          <div>Where to get it</div>
          <div>What it does</div>
        </div>
        {SECRETS.map(s => (
          <div key={s.key} className="grid grid-cols-[200px_80px_1fr_1fr] gap-3 px-4 py-3 border-b border-gray-100 last:border-0 text-sm items-center">
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 font-mono">
              {s.key}
            </code>
            <span className={`text-xs font-medium ${s.required ? 'text-red-600' : 'text-gray-500'}`}>
              {s.required ? 'Required' : 'Optional'}
            </span>
            <span className="text-xs text-gray-600">{s.where}</span>
            <span className="text-xs text-gray-600">{s.desc}</span>
          </div>
        ))}
      </div>

      {/* SQL hint */}
      <div className="bg-gray-900 rounded-xl p-4 text-sm text-green-400 font-mono mb-6">
        <div className="text-gray-500 text-xs mb-2"># Run in Replit shell after setup:</div>
        <div>python scripts/seed_markets.py</div>
        <div className="mt-1 text-gray-400"># Then visit: your-repl-url.replit.app</div>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <strong>Note:</strong> Alpha Lens is a paper trading and research tool. It does not provide financial advice.
        Live trading via Polymarket requires residency outside blocked jurisdictions — see Polymarket's terms.
      </div>
    </Layout>
  )
}
