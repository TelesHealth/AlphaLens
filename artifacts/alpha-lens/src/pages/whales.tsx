import { useState } from "react";
import {
  useGetWhalesStatus,
  useGetWhalesFlowAlerts,
  useGetWhalesFlowSummary,
  useGetWhalesDarkPool,
  useGetWhalesMarketTide,
} from "@workspace/api-client-react";
import {
  Fish,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  BarChart3,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/components/ui-helpers";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type TabId = "flow" | "darkpool" | "tide";

function formatPremium(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return ts;
  }
}

export default function Whales() {
  const [tab, setTab] = useState<TabId>("flow");
  const { data: statusData } = useGetWhalesStatus();
  const { data: summaryData, isLoading: summaryLoading } = useGetWhalesFlowSummary();
  const { data: flowData, isLoading: flowLoading } = useGetWhalesFlowAlerts();
  const { data: dpData, isLoading: dpLoading } = useGetWhalesDarkPool();
  const { data: tideData, isLoading: tideLoading } = useGetWhalesMarketTide();

  const configured = statusData?.configured ?? false;

  if (!configured) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4 max-w-md">
          <Fish className="w-12 h-12 text-muted-foreground/50 mx-auto" />
          <h2 className="text-xl font-display">Unusual Whales Not Configured</h2>
          <p className="text-muted-foreground text-sm">
            Add your UNUSUAL_WHALES_KEY to Secrets to enable live options flow, dark pool data, and market sentiment.
          </p>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: typeof Fish }[] = [
    { id: "flow", label: "Options Flow", icon: Zap },
    { id: "darkpool", label: "Dark Pool", icon: Eye },
    { id: "tide", label: "Market Tide", icon: BarChart3 },
  ];

  const tideChartData = (tideData?.ticks ?? []).map((t) => ({
    time: formatTime(t.timestamp),
    calls: parseFloat(t.net_call_premium) / 1_000_000,
    puts: parseFloat(t.net_put_premium) / 1_000_000,
    volume: t.net_volume,
  }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display text-glow-primary flex items-center gap-3">
            <Fish className="w-8 h-8 text-primary" /> Unusual Whales
          </h1>
          <p className="text-muted-foreground mt-1">
            Options flow alerts, dark pool prints, and market sentiment.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-success">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          LIVE DATA
        </div>
      </div>

      {summaryData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-mono text-muted-foreground mb-1">TOTAL PREMIUM</div>
            <div className="text-2xl font-bold">{formatPremium(summaryData.totalPremium)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-mono text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-success" /> CALL PREMIUM
            </div>
            <div className="text-2xl font-bold text-success">{formatPremium(summaryData.callPremium)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-mono text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-destructive" /> PUT PREMIUM
            </div>
            <div className="text-2xl font-bold text-destructive">{formatPremium(summaryData.putPremium)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-mono text-muted-foreground mb-1 flex items-center gap-1">
              <Activity className="w-3 h-3 text-warning" /> SWEEPS
            </div>
            <div className="text-2xl font-bold">{summaryData.sweepCount}</div>
            <div className="text-[10px] text-muted-foreground">{summaryData.totalAlerts} total alerts</div>
          </div>
        </div>
      )}

      {summaryData?.topTickers && summaryData.topTickers.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs font-mono text-muted-foreground mb-3">TOP TICKERS BY PREMIUM</div>
          <div className="flex flex-wrap gap-2">
            {summaryData.topTickers.map((t) => (
              <div key={t.ticker} className="px-3 py-2 rounded-lg bg-secondary/50 border border-border flex items-center gap-2">
                <span className="text-sm font-bold">{t.ticker}</span>
                <span className="text-xs text-primary font-mono">{formatPremium(t.premium)}</span>
                <span className="text-[10px] text-muted-foreground">{t.count} trades</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === t.id
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "flow" && (
        <div className="space-y-3">
          {flowLoading || summaryLoading ? (
            <div className="text-center py-20 text-muted-foreground text-sm">Loading options flow...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs font-mono text-muted-foreground uppercase bg-secondary/30 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left">Ticker</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-right">Strike</th>
                    <th className="px-4 py-3 text-left">Expiry</th>
                    <th className="px-4 py-3 text-right">Premium</th>
                    <th className="px-4 py-3 text-right">Size</th>
                    <th className="px-4 py-3 text-right">Vol/OI</th>
                    <th className="px-4 py-3 text-center">Flags</th>
                    <th className="px-4 py-3 text-left">Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(flowData?.alerts ?? []).map((a) => {
                    const prem = parseFloat(a.total_premium) || 0;
                    const voiRatio = parseFloat(a.volume_oi_ratio || "0");
                    return (
                      <tr key={a.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-bold">{a.ticker}</span>
                          <div className="text-[10px] text-muted-foreground">${a.underlying_price}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                            a.type === "call"
                              ? "bg-success/10 text-success border-success/30"
                              : "bg-destructive/10 text-destructive border-destructive/30"
                          )}>
                            {a.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">${a.strike}</td>
                        <td className="px-4 py-3 text-muted-foreground">{a.expiry}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          {formatPremium(prem)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{a.total_size}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          <span className={cn(voiRatio > 1 ? "text-warning" : "text-muted-foreground")}>
                            {voiRatio.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center space-x-1">
                          {a.has_sweep && (
                            <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[10px] font-bold border border-warning/30">
                              SWEEP
                            </span>
                          )}
                          {a.has_floor && (
                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold border border-primary/30">
                              FLOOR
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-muted-foreground font-mono">{a.alert_rule}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "darkpool" && (
        <div className="space-y-3">
          {dpLoading ? (
            <div className="text-center py-20 text-muted-foreground text-sm">Loading dark pool data...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs font-mono text-muted-foreground uppercase bg-secondary/30 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left">Ticker</th>
                    <th className="px-4 py-3 text-right">Size</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Notional</th>
                    <th className="px-4 py-3 text-right">NBBO Bid</th>
                    <th className="px-4 py-3 text-right">NBBO Ask</th>
                    <th className="px-4 py-3 text-center">Side</th>
                    <th className="px-4 py-3 text-left">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(dpData?.prints ?? []).map((p, i) => {
                    const price = parseFloat(p.price);
                    const bid = parseFloat(p.nbbo_bid || "0");
                    const ask = parseFloat(p.nbbo_ask || "0");
                    const notional = price * p.size;
                    const mid = (bid + ask) / 2;
                    const side = price >= ask ? "buy" : price <= bid ? "sell" : "mid";
                    return (
                      <tr key={i} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-3 font-bold">{p.ticker}</td>
                        <td className="px-4 py-3 text-right font-mono">{p.size.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono">${price.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          {formatPremium(notional)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">${bid.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">${ask.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                            side === "buy" ? "bg-success/10 text-success border-success/30" :
                            side === "sell" ? "bg-destructive/10 text-destructive border-destructive/30" :
                            "bg-muted text-muted-foreground border-border"
                          )}>
                            {side}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{formatTime(p.executed_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "tide" && (
        <div className="space-y-4">
          {tideLoading ? (
            <div className="text-center py-20 text-muted-foreground text-sm">Loading market tide...</div>
          ) : tideChartData.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">No market tide data available</div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-xs font-mono text-muted-foreground mb-4">NET PREMIUM FLOW (MILLIONS)</div>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={tideChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(v) => `$${v.toFixed(0)}M`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(value: number, name: string) => [
                          `$${value.toFixed(1)}M`,
                          name === "calls" ? "Net Call Premium" : "Net Put Premium"
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="calls"
                        stroke="hsl(var(--success))"
                        fill="hsl(var(--success) / 0.1)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="puts"
                        stroke="hsl(var(--destructive))"
                        fill="hsl(var(--destructive) / 0.1)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-3">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-1 rounded bg-success" />
                    <span className="text-muted-foreground">Net Call Premium</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-1 rounded bg-destructive" />
                    <span className="text-muted-foreground">Net Put Premium</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
