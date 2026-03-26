import Layout from '../components/Layout'

export default function ScenariosPage() {
  return (
    <Layout>
      <h1 className="text-2xl font-bold text-navy mb-2">Scenario Challenges</h1>
      <p className="text-sm text-gray-500 mb-6">
        Real historical moments frozen in time. See only what was knowable — make your call — then see what happened.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800">
        <div className="text-base font-semibold mb-2">Coming in Phase 2</div>
        <p className="text-sm">
          Scenario challenges require the historical correlation engine (E4) to be built and populated
          with resolved market data. Complete Phase 1 first: get the scanner running with live Polymarket
          data and AI scoring, then return here.
        </p>
      </div>
    </Layout>
  )
}
