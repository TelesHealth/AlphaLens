import Link from 'next/link'
import { useRouter } from 'next/router'
import clsx from 'clsx'

const NAV = [
  { href: '/',          label: 'Scanner'   },
  { href: '/briefing',  label: 'Briefing'  },
  { href: '/coach',     label: 'Live Coach'},
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/learn',     label: 'Learn'     },
  { href: '/scenarios', label: 'Challenges'},
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
          <Link href="/" className="font-bold text-lg text-navy tracking-tight">Alpha Lens</Link>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">v3.0</span>
          <nav className="flex items-center gap-1 flex-1">
            {NAV.map(({ href, label }) => (
              <Link key={href} href={href} className={clsx(
                'px-3 py-1.5 rounded text-sm transition-colors',
                router.pathname === href
                  ? 'bg-navy text-white font-medium'
                  : href === '/briefing'
                    ? 'text-accent font-medium hover:bg-blue-50 border border-accent/30'
                    : 'text-gray-600 hover:bg-gray-100'
              )}>{label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="live-dot" />
            <span className="text-xs text-gray-500">Agent live</span>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">{children}</main>
      <footer className="border-t border-gray-200 text-center text-xs text-gray-400 py-3">
        Alpha Lens · AI-Powered Global Investment Intelligence · Paper trading only — not financial advice
      </footer>
    </div>
  )
}
