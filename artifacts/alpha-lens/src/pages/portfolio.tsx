import { useState } from "react";
import { useGetPortfolio, useGetPortfolioStats, useCloseTrade, getGetPortfolioQueryKey } from "@workspace/api-client-react";
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

  const { data: portfolio, isLoading: isPortLoading } = useGetPortfolio({
    query: {
      queryKey: getGetPortfolioQueryKey(),
      // P3-35: keep the Mark Price (and resulting P&L) live. The backend
      // recomputes each open position's mark from the latest asset price on
      // every fetch, so polling here means the user sees the current mark
      // without a manual refresh. 60s matches the pending-orders cadence used
      // in the layout; React Query tears the interval down automatically when
      // this page unmounts. Background polling is disabled so we don't refetch
      // while the tab is hidden.
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    },
  });
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

  // P3-20/P3-23 (v2): backend returns closedTrades sorted DESC by
  // closedAt (newest first). The previous `slice(-10).reverse()` was
  // pulling the OLDEST 10 trades — so the chart never updated when the
  // user closed a new position. Take the FIRST 10 (newest) then reverse
  // so the chart still reads left-to-right oldest → newest.
  const chartData = portfolio.closedTrades.slice(0, 10).reverse().map(t => ({
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
          <div className="text-3xl font-display font-bold break-words">{formatCurrency(portfolio.balance)}</div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 text-muted-foreground mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="text-sm font-mono uppercase tracking-widest font-bold">Total P&L</span>
          </div>
          <div className="flex items-baseline flex-wrap gap-2 min-w-0">
            <div className={cn("text-3xl font-display font-bold break-words", portfolio.totalPnl >= 0 ? "text-success text-glow-success" : "text-destructive text-glow-destructive")}>
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
              <>
                {/* P3-24: column labels above the list so the right-hand
                    numbers (direction badge + P&L) read as data columns
                    rather than loose chips. Hidden on the smallest screens
                    where the row already self-describes. */}
                <div
                  className="hidden sm:flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-2 border-b border-border/40 bg-secondary/10 text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
                  aria-hidden="true"
                >
                  <div className="w-4 shrink-0" />
                  <div className="flex-1">Position</div>
                  <div className="w-[68px] text-center shrink-0">Direction</div>
                  <div className="w-[110px] text-right shrink-0">P&L</div>
                </div>
              <ul className="divide-y divide-border/50">
                {portfolio.openTrades.map((trade) => {
                  const isProfit = (trade.pnl || 0) >= 0;
                  const quantity = trade.quantity ?? 0;
                  const entryPrice = trade.entryPrice ?? 0;
                  const entryAmount = entryPrice * quantity;
                  // Derive current mark from pnl so the user can see where
                  // the asset is trading right now without an extra round-trip.
                  // pnl = (mark - entry) * qty for long, (entry - mark) * qty for short.
                  const pnlNum = trade.pnl ?? 0;
                  const markPrice =
                    quantity > 0
                      ? trade.direction === "short"
                        ? entryPrice - pnlNum / quantity
                        : entryPrice + pnlNum / quantity
                      : entryPrice;
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
                          "w-[68px] text-center px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded border shrink-0",
                          trade.direction === 'long'
                            ? "bg-success/10 text-success border-success/30"
                            : "bg-destructive/10 text-destructive border-destructive/30",
                        )}>
                          {trade.direction}
                        </span>
                        <div className="w-[110px] text-right shrink-0">
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
                          className="bg-gradient-to-b from-secondary/30 to-background/40 border-t border-border/40"
                          data-testid={`position-details-${trade.id}`}
                        >
                          <div className="px-5 sm:px-8 py-6 space-y-5">
                            {/* Trade economics — grouped in a subtle inner panel
                                so the dropdown reads as a distinct detail card
                                rather than a loose grid below the row. */}
                            <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-5">
                              <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                                  Trade Details
                                </h3>
                                <span className="text-[10px] font-mono text-muted-foreground/70">
                                  Opened {format(new Date(trade.openedAt), "MMM d, yyyy")}
                                </span>
                              </div>
                              <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
                                <div>
                                  <dt className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                                    Entry Price
                                  </dt>
                                  <dd className="font-mono text-base font-semibold tabular-nums">
                                    {formatCurrency(entryPrice)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                                    Mark Price
                                  </dt>
                                  <dd className={cn(
                                    "font-mono text-base font-semibold tabular-nums",
                                    isProfit ? "text-success" : "text-destructive",
                                  )}>
                                    {formatCurrency(markPrice)}
                                  </dd>
                                  <dd className="text-[10px] text-muted-foreground/70 mt-1">
                                    current
                                  </dd>
                                </div>
                                <div data-testid={`position-size-${trade.id}`}>
                                  <dt className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                                    Position Size
                                  </dt>
                                  <dd className="font-mono text-base font-semibold tabular-nums">
                                    {quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                  </dd>
                                  <dd className="text-[10px] text-muted-foreground/70 mt-1">
                                    units held
                                  </dd>
                                </div>
                                <div data-testid={`entry-amount-${trade.id}`}>
                                  <dt className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                                    Entry Amount
                                  </dt>
                                  <dd className="font-mono text-base font-semibold tabular-nums">
                                    {formatCurrency(entryAmount)}
                                  </dd>
                                  <dd className="text-[10px] text-muted-foreground/70 mt-1">
                                    cost basis
                                  </dd>
                                </div>
                              </dl>
                            </div>
                            {/* Action row — separated visually from the data
                                panel above so destructive/primary actions
                                don't compete with read-only numbers. */}
                            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
                              <Link
                                href="/coach"
                                onClick={() =>
                                  setAskCoachPrefill(
                                    `Walk me through my open ${trade.direction ?? ""} position in ${trade.assetName ?? trade.assetSymbol ?? `asset #${trade.assetId}`} in more depth (entry ${trade.entryPrice}, current P&L ${trade.pnl ?? 0}). Explain what's driving it right now and what I should be thinking about.`,
                                    trade.assetId ?? undefined,
                                  )
                                }
                                className="px-4 py-2.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 hover:border-primary/50 transition-all text-sm font-medium inline-flex items-center justify-center gap-2"
                                data-testid={`btn-ask-coach-position-${trade.id}`}
                                title="Ask the AI Coach about this position"
                              >
                                <MessageSquare className="w-4 h-4" /> Ask Coach
                              </Link>
                              <button
                                onClick={() => closeMutation.mutate({ id: trade.id })}
                                disabled={closeMutation.isPending}
                                className="px-4 py-2.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 hover:border-destructive/50 transition-all text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
                                data-testid={`btn-close-position-${trade.id}`}
                              >
                                <XCircle className="w-4 h-4" />
                                {closeMutation.isPending ? "Closing…" : "Close Position"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              </>
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
                  const isHistOpen = !!expanded[trade.id];
                  const quantity = trade.quantity ?? 0;
                  const entryPrice = trade.entryPrice ?? 0;
                  const exitPrice = trade.exitPrice ?? 0;
                  const entryAmount = entryPrice * quantity;
                  const exitAmount = exitPrice * quantity;
                  const closedAtLabel = trade.closedAt
                    ? format(new Date(trade.closedAt), "MMM d, yyyy · HH:mm")
                    : "—";
                  return (
                    <div key={trade.id} className="rounded-xl border border-border bg-background overflow-hidden">
                      {/* P3-25: collapsed row is a button that toggles
                          expansion. BUG-37: close date+time always visible
                          so users can see WHEN each trade resolved. */}
                      <button
                        type="button"
                        onClick={() => toggleRow(trade.id)}
                        aria-expanded={isHistOpen}
                        aria-controls={`history-details-${trade.id}`}
                        data-testid={`history-toggle-${trade.id}`}
                        className="w-full text-left p-4 hover:bg-secondary/50 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-2 gap-3">
                          <div className="min-w-0 flex items-start gap-2">
                            <ChevronDown
                              className={cn(
                                "w-4 h-4 mt-0.5 text-muted-foreground shrink-0 transition-transform",
                                isHistOpen && "rotate-180",
                              )}
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-foreground truncate">{trade.assetSymbol}</div>
                              <span className={cn("text-[10px] uppercase font-bold tracking-wider", trade.direction === 'long' ? "text-success" : "text-destructive")}>
                                {trade.direction}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn("font-mono font-bold", isProfit ? "text-success" : "text-destructive")}>
                              {isProfit ? "+" : ""}{formatCurrency(trade.pnl)}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {formatPercent(trade.pnlPercent)}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground font-mono mt-3 pt-3 border-t border-border/50 gap-2">
                          <span>In: {formatCurrency(trade.entryPrice)}</span>
                          <span>Out: {formatCurrency(trade.exitPrice)}</span>
                        </div>
                        <div className="mt-2 text-[10px] font-mono text-muted-foreground/70">
                          Closed {closedAtLabel}
                        </div>
                      </button>
                      {isHistOpen && (
                        <div
                          id={`history-details-${trade.id}`}
                          data-testid={`history-details-${trade.id}`}
                          className="px-4 pb-4 pt-3 border-t border-border/50 bg-secondary/20 space-y-3"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
                            <span className="text-muted-foreground">Trade Status</span>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded border font-bold",
                                isProfit
                                  ? "bg-success/10 text-success border-success/30"
                                  : "bg-destructive/10 text-destructive border-destructive/30",
                              )}
                            >
                              {trade.status ?? "closed"} · {isProfit ? "win" : "loss"}
                            </span>
                          </div>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs font-mono">
                            <div>
                              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Opened</dt>
                              <dd className="tabular-nums">{format(new Date(trade.openedAt), "MMM d, yyyy · HH:mm")}</dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Closed</dt>
                              <dd className="tabular-nums">{closedAtLabel}</dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Position Size</dt>
                              <dd className="tabular-nums">{quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} units</dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Entry Amount</dt>
                              <dd className="tabular-nums">{formatCurrency(entryAmount)}</dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Exit Amount</dt>
                              <dd className="tabular-nums">{formatCurrency(exitAmount)}</dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Realized P&L</dt>
                              <dd className={cn("tabular-nums font-bold", isProfit ? "text-success" : "text-destructive")}>
                                {isProfit ? "+" : ""}{formatCurrency(trade.pnl)} ({formatPercent(trade.pnlPercent)})
                              </dd>
                            </div>
                          </dl>
                        </div>
                      )}
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
