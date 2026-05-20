import { useState } from "react";
import { useGetPortfolio, useGetPortfolioStats, useCloseTrade } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Wallet,
  TrendingUp,
  PieChart as PieChartIcon,
  Activity,
  XCircle,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import { setAskCoachPrefill } from "@/lib/ask-coach";
import { format } from "date-fns";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from "recharts";
import { formatCurrency, formatPercent, cn } from "@/components/ui-helpers";
import { useToast } from "@/hooks/use-toast";

export default function Portfolio() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // P3-18: per-row expansion state. Map<tradeId, boolean>. Only the rows the
  // user explicitly opens are expanded — the rest stay collapsed so the list
  // is scannable on mobile without horizontal scrolling.
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const { data: portfolio, isLoading: isPortLoading } = useGetPortfolio();
  const { data: stats, isLoading: isStatsLoading } = useGetPortfolioStats();

  const closeMutation = useCloseTrade({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
        queryClient.invalidateQueries({ queryKey: ["/api/portfolio/stats"] });
        toast({ title: "Trade Closed", description: "Position successfully closed and P&L realized." });
      },
      onError: (err: any) => toast({ title: "Failed to close trade", description: err.message, variant: "destructive" })
    }
  });

  const isLoading = isPortLoading || isStatsLoading;

  if (isLoading) {
    return <div className="p-12 text-center text-primary animate-pulse">Loading portfolio data...</div>;
  }

  if (!portfolio || !stats) {
    return <div className="p-12 text-center text-destructive">Failed to load portfolio.</div>;
  }

  // Generate chart data from closed trades
  const chartData = portfolio.closedTrades.slice(-10).reverse().map(t => ({
    name: t.assetSymbol,
    pnl: t.pnl || 0,
    date: format(new Date(t.closedAt!), "MMM d"),
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const val = payload[0].value;
      return (
        <div className="bg-card border border-border p-3 rounded-lg shadow-xl">
          <p className="font-bold text-sm mb-1">{label}</p>
          <p className={cn("font-mono text-sm font-bold", val >= 0 ? "text-success" : "text-destructive")}>
            {formatCurrency(val)}
          </p>
        </div>
      );
    }
    return null;
  };

  function toggleRow(id: number) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-display text-glow-primary">Paper Trading</h1>
        <p className="text-muted-foreground mt-1">Simulated environment based on live AI intelligence.</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -mr-8 -mt-8" />
          <div className="flex items-center gap-3 text-muted-foreground mb-4">
            <Wallet className="w-5 h-5 text-primary" />
            <span className="text-sm font-mono uppercase tracking-widest font-bold">Total Balance</span>
          </div>
          <div className="text-3xl font-display font-bold">{formatCurrency(portfolio.balance)}</div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 text-muted-foreground mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="text-sm font-mono uppercase tracking-widest font-bold">Total P&L</span>
          </div>
          <div className="flex items-baseline gap-2">
            <div className={cn("text-3xl font-display font-bold", portfolio.totalPnl >= 0 ? "text-success text-glow-success" : "text-destructive text-glow-destructive")}>
              {portfolio.totalPnl >= 0 ? "+" : ""}{formatCurrency(portfolio.totalPnl)}
            </div>
            <div className={cn("text-sm font-mono font-medium", portfolio.totalPnlPercent >= 0 ? "text-success" : "text-destructive")}>
              ({formatPercent(portfolio.totalPnlPercent)})
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 text-muted-foreground mb-4">
            <PieChartIcon className="w-5 h-5 text-primary" />
            <span className="text-sm font-mono uppercase tracking-widest font-bold">Win Rate</span>
          </div>
          <div className="text-3xl font-display font-bold">{stats.winRate.toFixed(1)}%</div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 text-muted-foreground mb-4">
            <Activity className="w-5 h-5 text-primary" />
            <span className="text-sm font-mono uppercase tracking-widest font-bold">Avg Return</span>
          </div>
          <div className={cn("text-3xl font-display font-bold", stats.avgReturn >= 0 ? "text-success" : "text-destructive")}>
            {formatPercent(stats.avgReturn)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* P3-18: Open Positions list. Replaced the wide 7-column table
              with a vertical list of expandable cards. Collapsed cards show
              only Asset / Direction / P&L — the three things a user needs
              to scan a portfolio. Tapping the row reveals entry price,
              entry amount ($), position size (units), and the action
              buttons (Ask Coach, Close). This works without horizontal
              scrolling on mobile. */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
            <div className="p-6 border-b border-border flex justify-between items-center bg-secondary/20">
              <h2 className="text-xl font-display font-bold">Open Positions</h2>
              <span className="px-3 py-1 bg-primary/20 text-primary border border-primary/30 rounded-full text-xs font-mono font-bold">
                {portfolio.openTrades.length} ACTIVE
              </span>
            </div>
            {portfolio.openTrades.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <img src="/images/empty-portfolio.png" alt="Empty" className="w-32 h-32 opacity-50 mb-4 mix-blend-screen" />
                <p className="text-muted-foreground">No active trades. Visit the Scanner to find opportunities.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {portfolio.openTrades.map((trade) => {
                  const isProfit = (trade.pnl || 0) >= 0;
                  const entryAmount =
                    (trade.entryPrice ?? 0) * (trade.quantity ?? 0);
                  const quantity = trade.quantity ?? 0;
                  const isOpen = !!expanded[trade.id];
                  return (
                    <li key={trade.id}>
                      <button
                        type="button"
                        onClick={() => toggleRow(trade.id)}
                        aria-expanded={isOpen}
                        aria-controls={`position-details-${trade.id}`}
                        data-testid={`row-toggle-${trade.id}`}
                        className="w-full px-4 sm:px-6 py-4 flex items-center gap-3 sm:gap-4 hover:bg-secondary/50 transition-colors text-left"
                      >
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 text-muted-foreground shrink-0 transition-transform",
                            isOpen && "rotate-180",
                          )}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-foreground truncate">{trade.assetSymbol}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">{trade.assetName}</div>
                        </div>
                        <span className={cn(
                          "px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded border shrink-0",
                          trade.direction === 'long'
                            ? "bg-success/10 text-success border-success/30"
                            : "bg-destructive/10 text-destructive border-destructive/30",
                        )}>
                          {trade.direction}
                        </span>
                        <div className="text-right shrink-0">
                          <div className={cn("font-mono font-bold text-base", isProfit ? "text-success" : "text-destructive")}>
                            {isProfit ? "+" : ""}{formatCurrency(trade.pnl)}
                          </div>
                          <div className={cn("text-xs font-mono mt-0.5", isProfit ? "text-success/80" : "text-destructive/80")}>
                            {formatPercent(trade.pnlPercent)}
                          </div>
                        </div>
                      </button>
                      {isOpen && (
                        <div
                          id={`position-details-${trade.id}`}
                          className="px-4 sm:px-6 pb-5 pt-1 bg-background/40 border-t border-border/40"
                          data-testid={`position-details-${trade.id}`}
                        >
                          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                            <div>
                              <dt className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Entry Price</dt>
                              <dd className="font-mono text-sm mt-1">{formatCurrency(trade.entryPrice)}</dd>
                            </div>
                            <div data-testid={`entry-amount-${trade.id}`}>
                              <dt className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Entry Amount</dt>
                              <dd className="font-mono text-sm mt-1 font-semibold">{formatCurrency(entryAmount)}</dd>
                              <dd className="text-[10px] text-muted-foreground/70 mt-0.5">cost basis at open</dd>
                            </div>
                            <div data-testid={`position-size-${trade.id}`}>
                              <dt className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Position Size</dt>
                              <dd className="font-mono text-sm mt-1 font-semibold">
                                {quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              </dd>
                              <dd className="text-[10px] text-muted-foreground/70 mt-0.5">units held</dd>
                            </div>
                          </dl>
                          <div className="flex flex-wrap items-center gap-2 justify-end">
                            <Link
                              href="/coach"
                              onClick={() =>
                                setAskCoachPrefill(
                                  `Walk me through my open ${trade.direction ?? ""} position in ${trade.assetName ?? trade.assetSymbol ?? `asset #${trade.assetId}`} in more depth (entry ${trade.entryPrice}, current P&L ${trade.pnl ?? 0}). Explain what's driving it right now and what I should be thinking about.`,
                                  trade.assetId ?? undefined,
                                )
                              }
                              className="px-3 py-2 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors text-xs font-medium inline-flex items-center gap-1.5"
                              data-testid={`btn-ask-coach-position-${trade.id}`}
                              title="Ask the AI Coach about this position"
                            >
                              <MessageSquare className="w-3.5 h-3.5" /> Ask Coach
                            </Link>
                            <button
                              onClick={() => closeMutation.mutate({ id: trade.id })}
                              disabled={closeMutation.isPending}
                              className="px-4 py-2 rounded-lg bg-background border border-border hover:border-primary hover:text-primary transition-colors text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                              data-testid={`btn-close-position-${trade.id}`}
                            >
                              <XCircle className="w-3.5 h-3.5" /> Close
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Chart */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
            <h2 className="text-xl font-display font-bold mb-6">Recent Realized P&L</h2>
            <div className="h-[300px] w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--secondary))' }} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Not enough closed trades for chart data.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Closed Trades */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg flex flex-col h-[calc(100vh-10rem)] max-h-[800px]">
          <div className="p-6 border-b border-border bg-secondary/20 shrink-0">
            <h2 className="text-xl font-display font-bold">Trade History</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {portfolio.closedTrades.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No closed trades yet.</div>
            ) : (
              <div className="space-y-2">
                {portfolio.closedTrades.map(trade => {
                  const isProfit = (trade.pnl || 0) >= 0;
                  return (
                    <div key={trade.id} className="p-4 rounded-xl border border-border bg-background hover:bg-secondary/50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-foreground">{trade.assetSymbol}</div>
                          <span className={cn("text-[10px] uppercase font-bold tracking-wider", trade.direction === 'long' ? "text-success" : "text-destructive")}>
                            {trade.direction}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className={cn("font-mono font-bold", isProfit ? "text-success" : "text-destructive")}>
                            {isProfit ? "+" : ""}{formatCurrency(trade.pnl)}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {formatPercent(trade.pnlPercent)}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground font-mono mt-3 pt-3 border-t border-border/50">
                        <span>In: {formatCurrency(trade.entryPrice)}</span>
                        <span>Out: {formatCurrency(trade.exitPrice)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
