import { useState } from "react";
import { Link } from "wouter";
import { 
  useListMarkets, 
  useRefreshMarkets,
  MarketSector,
  ListMarketsSort 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { 
  formatCurrency, 
  formatPercent, 
  SectorBadge, 
  DirectionBadge, 
  ScoreDisplay,
  cn 
} from "@/components/ui-helpers";
import { useToast } from "@/hooks/use-toast";

export default function Scanner() {
  const [sector, setSector] = useState<MarketSector | "all">("all");
  const [sort, setSort] = useState<ListMarketsSort>("alpha_score");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useListMarkets({
    sector: sector === "all" ? undefined : sector,
    sort,
    limit: 100
  });

  const refreshMutation = useRefreshMarkets({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/markets"] });
        toast({ title: "Markets Refreshed", description: "Latest data and AI scores pulled." });
      },
      onError: () => {
        toast({ title: "Refresh Failed", description: "Could not update market data.", variant: "destructive" });
      }
    }
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-display text-glow-primary">Market Scanner</h1>
          <p className="text-muted-foreground mt-1">Real-time AI probability scoring across global assets.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button 
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-card border border-border hover:bg-secondary hover:border-primary/50 text-sm font-medium transition-all group disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", refreshMutation.isPending && "animate-spin")} />
            {refreshMutation.isPending ? "Scanning..." : "Scan Markets"}
          </button>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl shadow-xl shadow-black/20 overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-border flex flex-col md:flex-row gap-4 justify-between items-center bg-secondary/20">
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            <span className="text-xs font-mono text-muted-foreground mr-2 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" /> SECTOR
            </span>
            <button
              onClick={() => setSector("all")}
              className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap", sector === "all" ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:bg-secondary")}
            >
              All
            </button>
            {Object.values(MarketSector).map(s => (
              <button
                key={s}
                onClick={() => setSector(s)}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors uppercase whitespace-nowrap", sector === s ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:bg-secondary")}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-mono text-muted-foreground mr-2 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> SORT BY
            </span>
            <select 
              value={sort}
              onChange={(e) => setSort(e.target.value as ListMarketsSort)}
              className="bg-background border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-foreground"
            >
              <option value="alpha_score">Alpha Score</option>
              <option value="price_change">24h Change</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <RefreshCw className="w-8 h-8 animate-spin mb-4 text-primary/50" />
              Loading market intelligence...
            </div>
          ) : error ? (
            <div className="p-12 text-center text-destructive">Failed to load markets.</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs font-mono text-muted-foreground uppercase bg-secondary/30 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold tracking-wider">Asset</th>
                  <th className="px-6 py-4 font-semibold tracking-wider">Price / 24h</th>
                  <th className="px-6 py-4 font-semibold tracking-wider text-center">Alpha Score</th>
                  <th className="px-6 py-4 font-semibold tracking-wider text-center">AI Prob</th>
                  <th className="px-6 py-4 font-semibold tracking-wider text-center">Edge</th>
                  <th className="px-6 py-4 font-semibold tracking-wider">Direction</th>
                </tr>
              </thead>
              <tbody>
                {data?.markets.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      No markets found for this sector.
                    </td>
                  </tr>
                )}
                {data?.markets.map((market) => {
                  const isPositive = (market.priceChange24h || 0) > 0;
                  const isNegative = (market.priceChange24h || 0) < 0;
                  const edgeValue = market.edge || 0;
                  const hasTradeableEdge = edgeValue > 5;

                  return (
                    <tr key={market.id} className="data-grid-row group">
                      <td className="px-6 py-4">
                        <Link href={`/market/${market.id}`} className="block">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center font-display font-bold text-lg text-primary/80 group-hover:border-primary/50 transition-colors shadow-sm">
                              {market.symbol.substring(0, 1)}
                            </div>
                            <div>
                              <div className="font-bold text-foreground text-base group-hover:text-primary transition-colors">{market.name}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-mono text-muted-foreground">{market.symbol}</span>
                                <SectorBadge sector={market.sector} />
                              </div>
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-mono font-medium text-base">{formatCurrency(market.currentPrice)}</div>
                        <div className={cn("text-xs font-mono mt-1", isPositive ? "text-success" : isNegative ? "text-destructive" : "text-muted-foreground")}>
                          {formatPercent(market.priceChange24h)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-block px-3 py-1.5 rounded-lg bg-background border border-border shadow-inner">
                          <ScoreDisplay score={market.alphaScore} />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {market.aiProbability ? (
                          <div className="font-mono text-lg font-medium">{market.aiProbability}%</div>
                        ) : <span className="text-muted-foreground">—</span>}
                        {market.marketProbability && (
                          <div className="text-xs text-muted-foreground mt-1 font-mono">Mkt: {market.marketProbability}%</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {market.edge ? (
                          <div className={cn(
                            "inline-flex px-2.5 py-1 rounded font-mono text-sm font-bold",
                            hasTradeableEdge ? "bg-primary/20 text-primary border border-primary/30 text-glow-primary" : "text-muted-foreground"
                          )}>
                            +{market.edge.toFixed(1)}%
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        <DirectionBadge direction={market.direction!} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
