import { useState } from "react";
import { useRoute } from "wouter";
import { 
  useGetMarket, 
  useScoreMarket, 
  useOpenTrade,
  getGetMarketQueryKey,
  getListMarketsQueryKey,
  TradeDirection
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, 
  Target, 
  BrainCircuit, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Newspaper,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from "lucide-react";
import { Link } from "wouter";
import { setAskCoachPrefill } from "@/lib/ask-coach";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format } from "date-fns";
import { 
  formatCurrency, 
  formatPercent, 
  SectorBadge, 
  DirectionBadge, 
  RiskBadge,
  ImpactBadge,
  ScoreDisplay,
  cn 
} from "@/components/ui-helpers";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

function ProbabilityGauge({ value, title, color }: { value: number, title: string, color: string }) {
  const data = [
    { name: "Active", value: value },
    { name: "Remaining", value: 100 - value }
  ];
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              startAngle={180}
              endAngle={0}
              innerRadius={45}
              outerRadius={55}
              paddingAngle={0}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} style={{ filter: `drop-shadow(0px 0px 4px ${color})` }} />
              <Cell fill="var(--color-secondary)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
          <span className="text-2xl font-bold font-mono">{value}%</span>
        </div>
      </div>
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest mt-[-20px]">{title}</span>
    </div>
  );
}

export default function MarketDetail() {
  const [, params] = useRoute("/market/:id");
  const id = parseInt(params?.id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [tradeAmount, setTradeAmount] = useState(1000);
  const [tradeDirection, setTradeDirection] = useState<TradeDirection>("long");
  const [expandedSignalId, setExpandedSignalId] = useState<number | null>(null);

  const { data, isLoading } = useGetMarket(id, {
    query: { queryKey: getGetMarketQueryKey(id), enabled: !!id }
  });

  const scoreMutation = useScoreMarket({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/markets/${id}`] });
        queryClient.invalidateQueries({ queryKey: getListMarketsQueryKey() });
        toast({ title: "AI Analysis Complete", description: "Scores and probabilities updated." });
      },
      onError: () => toast({ title: "Analysis Failed", variant: "destructive" })
    }
  });

  const tradeMutation = useOpenTrade({
    mutation: {
      onSuccess: () => {
        setIsTradeModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
        const sym = data?.market?.symbol ?? data?.market?.name ?? "asset";
        const entryPx = data?.market?.currentPrice;
        const entryStr = entryPx != null ? ` @ ${formatCurrency(entryPx)}` : "";
        toast({
          title: "Paper trade executed",
          description: `${tradeDirection.toUpperCase()} ${formatCurrency(tradeAmount)} on ${sym}${entryStr}`,
        });
      },
      onError: (err: any) => toast({ title: "Trade Failed", description: err.message, variant: "destructive" })
    }
  });

  if (isLoading) return <div className="p-12 text-center text-primary animate-pulse">Loading market data...</div>;
  if (!data) return <div className="p-12 text-center text-destructive">Market not found</div>;

  const { market, signals, relatedMarkets } = data;
  const isPositive = (market.priceChange24h || 0) > 0;

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-bottom-4 duration-500">
      <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Scanner
      </Link>

      {/* Header Panel */}
      <div className="bg-card border border-border rounded-2xl p-6 lg:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row justify-between gap-8 relative z-10">
          <div className="space-y-6 flex-1">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-4xl lg:text-5xl font-display font-bold">{market.name}</h1>
                  <SectorBadge sector={market.sector} />
                </div>
                <div className="flex items-center gap-4 text-muted-foreground font-mono">
                  <span className="text-lg">{market.symbol}</span>
                  <div className="w-1 h-1 rounded-full bg-border" />
                  <span>Last Scored: {market.lastScoredAt ? format(new Date(market.lastScoredAt), "HH:mm 'UTC'") : "Never"}</span>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-4xl font-mono font-bold">{formatCurrency(market.currentPrice)}</div>
                <div className={cn("text-lg font-mono font-medium flex items-center justify-end gap-1 mt-1", isPositive ? "text-success" : "text-destructive")}>
                  {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  {formatPercent(market.priceChange24h)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border/50">
              <button 
                onClick={() => setIsTradeModalOpen(true)}
                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] hover:-translate-y-0.5 transition-all flex items-center gap-2"
              >
                <Target className="w-5 h-5" /> Trade Asset
              </button>
              <button 
                onClick={() => scoreMutation.mutate({ id })}
                disabled={scoreMutation.isPending}
                className="px-6 py-3 rounded-xl bg-secondary border border-border hover:border-primary/50 text-foreground font-medium transition-all flex items-center gap-2 group disabled:opacity-50"
              >
                <BrainCircuit className={cn("w-5 h-5 text-primary", scoreMutation.isPending && "animate-pulse")} /> 
                {scoreMutation.isPending ? "Analyzing..." : "Trigger Deep Analysis"}
              </button>
              {/* Bug #12: Ask Coach about this specific asset. */}
              <Link
                href="/coach"
                onClick={() =>
                  setAskCoachPrefill(
                    `Walk me through ${market.name} (${market.symbol}) in more depth. Current price ${market.currentPrice}, alpha score ${market.alphaScore ?? "n/a"}, direction ${market.direction ?? "n/a"}. Explain the setup and what I should be thinking about.`,
                    id,
                  )
                }
                className="px-6 py-3 rounded-xl bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 font-medium transition-all flex items-center gap-2"
                data-testid="btn-ask-coach-market"
              >
                <MessageSquare className="w-5 h-5" /> Ask Coach
              </Link>
            </div>
          </div>

          <div className="flex gap-8 items-center bg-background/50 rounded-2xl p-6 border border-border/50 min-w-fit">
            <div className="flex flex-col items-center justify-center px-4 border-r border-border/50">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">Alpha Score</span>
              <ScoreDisplay score={market.alphaScore} size="xl" />
              <div className="mt-4 flex gap-2">
                <DirectionBadge direction={market.direction!} />
                <RiskBadge risk={market.riskLevel!} />
              </div>
            </div>
            
            <div className="flex gap-4">
              <ProbabilityGauge 
                value={market.aiProbability || 0} 
                title="AI PROB" 
                color="hsl(var(--primary))" 
              />
              <ProbabilityGauge 
                value={market.marketProbability || 0} 
                title="MKT IMP" 
                color="hsl(var(--muted-foreground))" 
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* AI Summary */}
          {market.aiSummary && (
            <div className="bg-card border border-primary/20 rounded-2xl p-6 shadow-lg relative">
              <div className="absolute top-4 right-4 text-primary/20">
                <BrainCircuit className="w-24 h-24" />
              </div>
              <h3 className="text-sm font-mono text-primary font-bold uppercase tracking-widest mb-4 flex items-center gap-2 relative z-10">
                <Zap className="w-4 h-4" /> Intelligence Brief
              </h3>
              <div className="text-base leading-relaxed text-foreground/90 relative z-10 font-medium prose prose-invert max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:text-foreground [&_ul]:my-2 [&_li]:my-0.5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{market.aiSummary}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Signals Timeline */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-lg font-display font-bold mb-6 flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-primary" /> Evidence & Signals
            </h3>
            
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
              {signals.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No recent signals analyzed.</p>
              ) : signals.map((signal) => {
                const isExpanded = expandedSignalId === signal.id;
                return (
                <div key={signal.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-card bg-secondary text-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div
                    className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border bg-background hover:border-primary/30 transition-colors shadow-sm cursor-pointer"
                    onClick={() => setExpandedSignalId(isExpanded ? null : signal.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground bg-secondary px-2 py-1 rounded">
                          {signal.source}
                        </span>
                        <ImpactBadge impact={signal.impact} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">
                          {format(new Date(signal.createdAt), "MMM d, HH:mm")}
                        </span>
                        {signal.detail && (isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />)}
                      </div>
                    </div>
                    <h4 className="text-sm font-semibold mb-1">{signal.headline}</h4>
                    {signal.detail && <p className={cn("text-xs text-muted-foreground mt-2", !isExpanded && "line-clamp-2")}>{signal.detail}</p>}
                    <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                      <DirectionBadge direction={signal.direction} />
                      <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                        CONF: <span className="text-foreground">{signal.confidence}%</span>
                      </span>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest mb-4">Related Markets</h3>
            <div className="space-y-3">
              {relatedMarkets.length === 0 ? (
                <p className="text-xs text-muted-foreground">None found.</p>
              ) : relatedMarkets.map(rm => (
                <Link key={rm.id} href={`/market/${rm.id}`} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:border-primary/50 transition-colors group">
                  <div>
                    <div className="font-bold group-hover:text-primary transition-colors text-sm">{rm.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate w-32">{rm.name}</div>
                  </div>
                  <div className="text-right">
                    <ScoreDisplay score={rm.alphaScore} size="sm" />
                    <DirectionBadge direction={rm.direction!} />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-secondary to-background border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold">Risk Assessment</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Based on historical volatility and current AI probability divergence, this asset exhibits <strong className="text-foreground">{market.riskLevel}</strong> risk characteristics. Position sizing should be adjusted accordingly.
            </p>
          </div>
        </div>
      </div>

      {/* Trade Modal */}
      {isTradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary to-accent" />
            <h2 className="text-2xl font-display font-bold mb-1">Open Position</h2>
            <p className="text-muted-foreground text-sm mb-6">Paper trading simulation for {market.name}</p>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-background border border-border">
                <span className="text-muted-foreground font-mono text-sm">Current Price</span>
                <span className="font-mono font-bold text-lg">{formatCurrency(market.currentPrice)}</span>
              </div>

              <div>
                <label className="block text-xs font-mono text-muted-foreground mb-2">DIRECTION</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setTradeDirection("long")}
                    className={cn("py-3 rounded-lg border font-bold uppercase tracking-wider transition-all", tradeDirection === "long" ? "bg-success/20 border-success text-success" : "bg-background border-border text-muted-foreground hover:bg-secondary")}
                  >
                    {market.sector === "prediction" ? "Yes" : "Long"}
                  </button>
                  <button 
                    onClick={() => setTradeDirection("short")}
                    className={cn("py-3 rounded-lg border font-bold uppercase tracking-wider transition-all", tradeDirection === "short" ? "bg-destructive/20 border-destructive text-destructive" : "bg-background border-border text-muted-foreground hover:bg-secondary")}
                  >
                    {market.sector === "prediction" ? "No" : "Short"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-muted-foreground mb-2">AMOUNT (USD)</label>
                <input 
                  type="number" 
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 font-mono text-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setIsTradeModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-border bg-background hover:bg-secondary transition-colors font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => tradeMutation.mutate({ data: { assetId: id, direction: tradeDirection, amount: tradeAmount } })}
                  disabled={tradeMutation.isPending}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-50"
                >
                  {tradeMutation.isPending ? "Executing..." : "Execute Trade"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
