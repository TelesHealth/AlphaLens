import { useState } from "react";
import {
  useGetRadarAlerts,
  useGetRadarPrices,
  useGetRadarStatus,
  useTriggerRadarScan,
  useGetRadarAllChains,
  useGetRadarOptionsFlow,
  useGetRadarDarkPool,
  useGetRadarCongress,
  useGetRadarCryptoWhales,
  getGetRadarAlertsQueryKey,
  getGetRadarPricesQueryKey,
  getGetRadarAllChainsQueryKey,
  getGetRadarOptionsFlowQueryKey,
  getGetRadarDarkPoolQueryKey,
  getGetRadarCongressQueryKey,
  getGetRadarCryptoWhalesQueryKey,
} from "@workspace/api-client-react";
import type {
  RadarAlert,
  RadarPriceRow,
  SmartMoneyAlert,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Radio,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Link2,
  RefreshCw,
  Zap,
  Eye,
  Server,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Shield,
  Landmark,
  Waves,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, formatCurrency } from "@/components/ui-helpers";
import { useToast } from "@/hooks/use-toast";

type TabId = "alerts" | "prices" | "chains" | "smartmoney" | "sources";

const SEV_STYLES: Record<string, { card: string; badge: string; border: string; glow: string }> = {
  critical: {
    card: "bg-destructive/5 border-destructive/30",
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    border: "border-l-destructive",
    glow: "shadow-[inset_0_0_20px_rgba(239,68,68,0.08)]",
  },
  high: {
    card: "bg-warning/5 border-warning/30",
    badge: "bg-warning/15 text-warning border-warning/30",
    border: "border-l-warning",
    glow: "shadow-[inset_0_0_20px_rgba(245,158,11,0.08)]",
  },
  medium: {
    card: "bg-primary/5 border-primary/20",
    badge: "bg-primary/15 text-primary border-primary/20",
    border: "border-l-primary",
    glow: "",
  },
  low: {
    card: "bg-muted/50 border-border",
    badge: "bg-muted text-muted-foreground border-border",
    border: "border-l-muted-foreground/30",
    glow: "",
  },
  normal: {
    card: "bg-muted/50 border-border",
    badge: "bg-muted text-muted-foreground border-border",
    border: "border-l-muted-foreground/20",
    glow: "",
  },
};

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  price_spike: Zap,
  volume_anomaly: BarChart3,
  chain_reaction: Link2,
  news_catalyst: Radio,
};

const TYPE_LABELS: Record<string, string> = {
  price_spike: "Price Spike",
  volume_anomaly: "Volume Anomaly",
  chain_reaction: "Chain Reaction",
  news_catalyst: "News Catalyst",
};

function AlertCard({ alert, expanded, onToggle }: { alert: RadarAlert; expanded: boolean; onToggle: () => void }) {
  const style = SEV_STYLES[alert.severity ?? "medium"] ?? SEV_STYLES.medium;
  const isUp = (alert.pctChange ?? 0) > 0 || alert.direction === "up" || alert.direction === "bull";
  const TypeIcon = TYPE_ICONS[alert.type ?? ""] ?? AlertTriangle;

  return (
    <div
      className={cn(
        "rounded-xl border border-l-4 transition-all duration-200 cursor-pointer hover:bg-card/80",
        style.card,
        style.border,
        style.glow,
      )}
      onClick={onToggle}
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={cn("px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded border", style.badge)}>
            {(alert.severity ?? "medium").toUpperCase()}
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-muted text-muted-foreground border border-border">
            <TypeIcon className="w-3 h-3" />
            {TYPE_LABELS[alert.type ?? ""] ?? alert.type}
          </span>
          <span className="text-sm font-semibold text-foreground">{alert.assetLabel}</span>
          <span className="flex-1" />
          {alert.pctChange != null && (
            <span className={cn("text-sm font-bold font-mono", isUp ? "text-success" : "text-destructive")}>
              {isUp ? "+" : ""}{alert.pctChange.toFixed(1)}%
            </span>
          )}
          {alert.confidence != null && (
            <span className="text-[10px] text-muted-foreground font-mono">{alert.confidence}% conf</span>
          )}
          <span className="text-[10px] text-muted-foreground font-mono">
            {alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>

        <p className="text-sm font-medium text-foreground mb-1">{alert.title}</p>

        {(alert.note || alert.reason || alert.historicalNote) && (
          <div className="text-xs text-muted-foreground leading-relaxed prose prose-invert prose-xs max-w-none [&_p]:m-0 [&_strong]:text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{alert.note || alert.reason || alert.historicalNote || ""}</ReactMarkdown>
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          {alert.priceStart != null && alert.priceNow != null && (
            <div className="flex gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Price at start: </span>
                <span className="font-mono font-medium">{formatCurrency(alert.priceStart)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Price now: </span>
                <span className="font-mono font-medium">{formatCurrency(alert.priceNow)}</span>
              </div>
              {alert.windowMinutes != null && (
                <div>
                  <span className="text-muted-foreground">Window: </span>
                  <span className="font-mono">{alert.windowMinutes}min</span>
                </div>
              )}
            </div>
          )}

          {alert.triggerAsset && (
            <div className="text-xs">
              <span className="text-muted-foreground">Triggered by: </span>
              <span className="font-medium text-warning">{alert.triggerAsset.replace(/_/g, " ").toUpperCase()}</span>
              {alert.triggerPct != null && (
                <span className="font-mono ml-1">({alert.triggerPct > 0 ? "+" : ""}{alert.triggerPct.toFixed(1)}%)</span>
              )}
            </div>
          )}

          {alert.chainAssets && alert.chainAssets.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Watch:</span>
              {alert.chainAssets.map((a) => (
                <span key={a} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                  {a.replace(/_/g, " ").toUpperCase()}
                </span>
              ))}
            </div>
          )}

          {alert.historicalNote && alert.type === "price_spike" && (
            <div className="text-xs bg-muted/50 rounded-lg px-3 py-2 text-muted-foreground italic border border-border/50">
              {alert.historicalNote}
            </div>
          )}

          {alert.aiScanning && (
            <div className="text-[10px] text-muted-foreground/70 italic flex items-center gap-1.5">
              <Activity className="w-3 h-3 animate-pulse" />
              {alert.aiScanning}
            </div>
          )}

          {alert.dataSource && (
            <div className="text-[10px] text-muted-foreground/50">Source: {alert.dataSource}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RadarPage() {
  const [tab, setTab] = useState<TabId>("alerts");
  const [sevFilter, setSevFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: alertsData, isLoading: alertsLoading } = useGetRadarAlerts(
    { hours: 8 },
    { query: { queryKey: getGetRadarAlertsQueryKey({ hours: 8 }), refetchInterval: 5 * 60 * 1000 } },
  );
  const { data: pricesData, isLoading: pricesLoading } = useGetRadarPrices({
    query: { queryKey: getGetRadarPricesQueryKey(), refetchInterval: 5 * 60 * 1000 },
  });
  const { data: statusData } = useGetRadarStatus();
  const { data: chainsData, isLoading: chainsLoading } = useGetRadarAllChains({
    query: { queryKey: getGetRadarAllChainsQueryKey() },
  });

  const { data: optionsFlowData, isLoading: optionsLoading, isError: optionsError } = useGetRadarOptionsFlow(
    { limit: 50 },
    { query: { queryKey: getGetRadarOptionsFlowQueryKey({ limit: 50 }), enabled: tab === "smartmoney", retry: false } },
  );
  const { data: darkPoolData, isLoading: darkPoolLoading, isError: darkPoolError } = useGetRadarDarkPool(
    { limit: 50 },
    { query: { queryKey: getGetRadarDarkPoolQueryKey({ limit: 50 }), enabled: tab === "smartmoney", retry: false } },
  );
  const { data: congressData, isLoading: congressLoading, isError: congressError } = useGetRadarCongress(
    { limit: 50 },
    { query: { queryKey: getGetRadarCongressQueryKey({ limit: 50 }), enabled: tab === "smartmoney", retry: false } },
  );
  const { data: cryptoWhalesData, isLoading: cryptoLoading, isError: cryptoError } = useGetRadarCryptoWhales(
    { limit: 50 },
    { query: { queryKey: getGetRadarCryptoWhalesQueryKey({ limit: 50 }), enabled: tab === "smartmoney", retry: false } },
  );

  const uwNotConfigured = optionsError || darkPoolError || congressError || cryptoError;

  const scanMutation = useTriggerRadarScan({
    mutation: {
      onSuccess: () => {
        setScanning(true);
        toast({ title: "Radar scan triggered", description: "Results will appear in ~30 seconds." });
        setTimeout(async () => {
          await queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/radar") });
          setScanning(false);
          const cached = queryClient.getQueryData<{ alerts?: unknown[] }>(getGetRadarAlertsQueryKey());
          const count = cached?.alerts?.length ?? 0;
          toast({ title: "Radar Scan Complete", description: `${count} alerts generated.` });
        }, 35000);
      },
    },
  });

  const isBusy = scanning || scanMutation.isPending;

  const alerts = alertsData?.alerts ?? [];
  const prices = pricesData?.prices ?? [];

  const filteredAlerts = alerts.filter((a) => {
    if (sevFilter !== "all" && a.severity !== sevFilter) return false;
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    return true;
  });

  const spikeCount = alerts.filter((a) => a.type === "price_spike").length;
  const volCount = alerts.filter((a) => a.type === "volume_anomaly").length;
  const chainCount = alerts.filter((a) => a.type === "chain_reaction").length;
  const criticalCount = alerts.filter((a) => a.severity === "critical" || a.severity === "high").length;

  const tabs: { id: TabId; label: string; icon: typeof Radio }[] = [
    { id: "alerts", label: "Live Alerts", icon: Radio },
    { id: "prices", label: "Price Monitor", icon: Activity },
    { id: "chains", label: "Chain Reactions", icon: Link2 },
    { id: "smartmoney", label: "Smart Money", icon: DollarSign },
    { id: "sources", label: "Data Sources", icon: Server },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20">
              <Radio className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight">Market Radar</h1>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                PRICE SPIKES · VOLUME ANOMALIES · CHAIN REACTIONS
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
            <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse" />
            <span className="text-[10px] font-mono text-muted-foreground">LIVE — 5 MIN CYCLE</span>
          </div>
          <button
            onClick={() => scanMutation.mutate(undefined as never)}
            disabled={isBusy}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
            )}
          >
            <RefreshCw className={cn("w-4 h-4", isBusy && "animate-spin")} />
            {isBusy ? "Scanning..." : "Scan Now"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "CRITICAL / HIGH", value: criticalCount, icon: AlertTriangle, color: criticalCount > 0 ? "text-destructive" : "text-foreground" },
          { label: "PRICE SPIKES", value: spikeCount, icon: Zap, color: "text-warning" },
          { label: "VOLUME ANOMALIES", value: volCount, icon: BarChart3, color: "text-primary" },
          { label: "CHAIN REACTIONS", value: chainCount, icon: Link2, color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-card border border-border p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] font-mono text-muted-foreground tracking-wider">{s.label}</span>
            </div>
            <div className={cn("text-2xl font-bold font-mono", s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-all",
              tab === id
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "alerts" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={sevFilter}
              onChange={(e) => setSevFilter(e.target.value)}
              className="text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground"
            >
              <option value="all">All types</option>
              <option value="price_spike">Price spikes</option>
              <option value="volume_anomaly">Volume anomalies</option>
              <option value="chain_reaction">Chain reactions</option>
            </select>
          </div>

          {alertsLoading ? (
            <div className="text-center py-20">
              <Activity className="w-8 h-8 text-muted-foreground animate-pulse mx-auto mb-3" />
              <div className="text-sm text-muted-foreground">Scanning markets...</div>
              <p className="text-xs text-muted-foreground/70 mt-1">First scan may take up to 30 seconds</p>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-20">
              <Eye className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <div className="text-sm text-muted-foreground mb-1">No alerts in the last 8 hours</div>
              <p className="text-xs text-muted-foreground/70 mb-4">
                Markets are moving within normal thresholds. Click Scan Now to check immediately.
              </p>
              <button
                onClick={() => scanMutation.mutate(undefined as never)}
                disabled={isBusy}
                className="text-xs bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {isBusy ? "Scanning..." : "Scan Now"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  expanded={expandedId === alert.id}
                  onToggle={() => setExpandedId(expandedId === alert.id ? null : (alert.id ?? null))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "prices" && (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-3 bg-muted/50 border-b border-border">
            <span className="text-[10px] font-mono text-muted-foreground tracking-wider">ASSET</span>
            <span className="text-[10px] font-mono text-muted-foreground tracking-wider text-right">PRICE</span>
            <span className="text-[10px] font-mono text-muted-foreground tracking-wider text-right">CHANGE</span>
            <span className="text-[10px] font-mono text-muted-foreground tracking-wider text-center">STATUS</span>
            <span className="text-[10px] font-mono text-muted-foreground tracking-wider text-right">THRESHOLD</span>
          </div>
          {pricesLoading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Loading prices...</div>
          ) : prices.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No price data yet. Click Scan Now to fetch prices.
            </div>
          ) : (
            prices.map((p) => (
              <div
                key={p.assetId}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-3 border-b border-border/50 last:border-0 items-center hover:bg-muted/30 transition-colors"
              >
                <div className="text-sm font-medium">{p.assetLabel}</div>
                <div className="text-sm text-right font-mono font-medium">
                  {(p.price ?? 0) > 1000
                    ? `$${(p.price ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                    : (p.price ?? 0) > 1
                      ? `$${(p.price ?? 0).toFixed(2)}`
                      : `$${(p.price ?? 0).toFixed(4)}`}
                </div>
                <div className={cn("text-sm text-right font-mono font-medium", (p.pctChange ?? 0) >= 0 ? "text-success" : "text-destructive")}>
                  {p.pctChange != null ? `${p.pctChange > 0 ? "+" : ""}${p.pctChange.toFixed(1)}%` : "—"}
                </div>
                <div className="text-center">
                  {p.spikeDetected ? (
                    <span className="text-[10px] font-bold bg-destructive/15 text-destructive px-2 py-0.5 rounded-full border border-destructive/30">
                      SPIKE
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Normal</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground text-right font-mono">{p.threshold}</div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "chains" && (
        <div className="space-y-4">
          {chainsLoading ? (
            <div className="text-center py-20 text-muted-foreground text-sm">Loading chain reaction maps...</div>
          ) : !chainsData?.chains || Object.keys(chainsData.chains).length === 0 ? (
            <div className="text-center py-20">
              <Link2 className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <div className="text-sm text-muted-foreground">No chain reaction data available</div>
            </div>
          ) : (
            Object.entries(chainsData.chains as Record<string, Array<{ asset: string; direction: string; confidence: number; reason: string }>>).map(([trigger, reactions]) => (
              <div key={trigger} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center gap-2">
                  <Zap className="w-4 h-4 text-warning" />
                  <span className="text-sm font-bold">{trigger.replace(/_/g, " ").toUpperCase()}</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">{reactions.length} downstream</span>
                </div>
                <div className="divide-y divide-border/50">
                  {reactions.map((r) => (
                    <div key={r.asset} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                      <div className={cn("w-2 h-2 rounded-full", r.direction === "bull" ? "bg-success" : r.direction === "bear" ? "bg-destructive" : "bg-warning")} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{r.asset.replace(/_/g, " ").toUpperCase()}</div>
                        <div className="text-xs text-muted-foreground">{r.reason}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          "text-[10px] font-bold uppercase px-2 py-0.5 rounded border",
                          r.direction === "bull" ? "bg-success/10 text-success border-success/30" :
                          r.direction === "bear" ? "bg-destructive/10 text-destructive border-destructive/30" :
                          "bg-warning/10 text-warning border-warning/30"
                        )}>
                          {r.direction}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">{r.confidence}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "smartmoney" && (
        <div className="space-y-6">
          {uwNotConfigured ? (
            <div className="rounded-xl bg-warning/10 border border-warning/30 p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-3" />
              <h3 className="text-sm font-bold text-warning mb-2">Smart Money Signals Not Available</h3>
              <p className="text-xs text-muted-foreground">
                Smart Money signals require an Unusual Whales API subscription.
                Add <code className="bg-warning/10 px-1 rounded text-warning">UNUSUAL_WHALES_KEY</code> to Replit Secrets to activate options flow, dark pool, congressional trades, and crypto whale tracking.
              </p>
            </div>
          ) : (
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex items-center gap-3">
            <Shield className="w-5 h-5 text-primary shrink-0" />
            <div className="text-sm text-primary">
              <strong>Powered by Unusual Whales</strong> — institutional-grade smart money signals including options flow, dark pool, congressional trades, and crypto whale activity.
            </div>
          </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-warning" />
              <h3 className="text-sm font-bold tracking-wide">OPTIONS FLOW</h3>
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">{optionsFlowData?.total ?? 0} alerts</span>
            </div>
            {optionsLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading options flow...</div>
            ) : !optionsFlowData?.alerts || optionsFlowData.alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No significant options flow detected</div>
            ) : (
              <div className="space-y-2">
                {(optionsFlowData.alerts as SmartMoneyAlert[]).map((a) => (
                  <div key={a.id} className={cn(
                    "rounded-xl border border-l-4 p-4",
                    a.severity === "high" ? "bg-warning/5 border-warning/30 border-l-warning" : "bg-primary/5 border-primary/20 border-l-primary",
                  )}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-bold">{a.assetLabel}</span>
                      {a.direction && (
                        <span className={cn(
                          "text-[10px] font-bold uppercase px-2 py-0.5 rounded border",
                          a.direction === "bull" ? "bg-success/10 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30",
                        )}>
                          {a.direction === "bull" ? "↑ CALL" : "↓ PUT"}
                        </span>
                      )}
                      <span className={cn(
                        "px-2 py-0.5 text-[10px] uppercase font-bold rounded border",
                        a.severity === "high" ? "bg-warning/15 text-warning border-warning/30" : "bg-primary/15 text-primary border-primary/20",
                      )}>
                        {a.severity}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{a.title}</p>
                    {a.note && <p className="text-xs text-muted-foreground mt-1">{a.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-bold tracking-wide">DARK POOL</h3>
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">{darkPoolData?.total ?? 0} trades</span>
            </div>
            {darkPoolLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading dark pool...</div>
            ) : !darkPoolData?.trades || darkPoolData.trades.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No significant dark pool activity</div>
            ) : (
              <div className="space-y-2">
                {(darkPoolData.trades as SmartMoneyAlert[]).map((a) => (
                  <div key={a.id} className="rounded-xl border border-l-4 border-border border-l-muted-foreground/30 p-4 bg-muted/30">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold">{a.assetLabel}</span>
                      <span className="text-[10px] bg-muted px-2 py-0.5 rounded border border-border text-muted-foreground">Off-exchange block trade</span>
                    </div>
                    <p className="text-sm text-foreground">{a.title}</p>
                    {a.note && <p className="text-xs text-muted-foreground mt-1">{a.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Landmark className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold tracking-wide">CONGRESS TRADES</h3>
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">{congressData?.total ?? 0} trades</span>
            </div>
            {congressLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading congressional trades...</div>
            ) : !congressData?.trades || congressData.trades.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No recent congressional trades</div>
            ) : (
              <div className="space-y-2">
                {(congressData.trades as SmartMoneyAlert[]).map((a) => (
                  <div key={a.id} className={cn(
                    "rounded-xl border border-l-4 p-4",
                    a.direction === "bull" ? "bg-success/5 border-success/20 border-l-success" : "bg-destructive/5 border-destructive/20 border-l-destructive",
                  )}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-bold">{a.assetLabel}</span>
                      {a.direction && (
                        <span className={cn(
                          "text-[10px] font-bold uppercase px-2 py-0.5 rounded border",
                          a.direction === "bull" ? "bg-success/10 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30",
                        )}>
                          {a.direction === "bull" ? "Purchase" : "Sale"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground">{a.title}</p>
                    {a.note && <p className="text-xs text-muted-foreground mt-1">{a.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Waves className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold tracking-wide">CRYPTO WHALES</h3>
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">{cryptoWhalesData?.total ?? 0} transactions</span>
            </div>
            {cryptoLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading crypto whales...</div>
            ) : !cryptoWhalesData?.transactions || cryptoWhalesData.transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No large crypto whale transactions detected</div>
            ) : (
              <div className="space-y-2">
                {(cryptoWhalesData.transactions as SmartMoneyAlert[]).map((a) => (
                  <div key={a.id} className={cn(
                    "rounded-xl border border-l-4 p-4",
                    a.severity === "high" ? "bg-warning/5 border-warning/30 border-l-warning" : "bg-primary/5 border-primary/20 border-l-primary",
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold">{a.assetLabel}</span>
                      <span className={cn(
                        "px-2 py-0.5 text-[10px] uppercase font-bold rounded border",
                        a.severity === "high" ? "bg-warning/15 text-warning border-warning/30" : "bg-primary/15 text-primary border-primary/20",
                      )}>
                        {a.severity}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{a.title}</p>
                    {a.note && <p className="text-xs text-muted-foreground mt-1">{a.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "sources" && statusData && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "ACTIVE SOURCES", value: statusData.activeSources, color: "text-success" },
              { label: "ASSETS MONITORED", value: statusData.assetsMonitored, color: "text-foreground" },
              { label: "CHAIN MAPS", value: statusData.chainMaps, color: "text-foreground" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-card border border-border p-4">
                <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-1">{s.label}</div>
                <div className={cn("text-2xl font-bold font-mono", s.color)}>{s.value ?? 0}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-warning/5 border border-warning/20 p-4 text-sm text-warning">
            <strong>Upgrade options:</strong> For real-time commodity prices (vs 15-min delay), add{" "}
            <code className="bg-warning/10 px-1 rounded">ALPHA_VANTAGE_KEY</code> (~$50/mo). For options flow / dark pool large
            volume, add <code className="bg-warning/10 px-1 rounded">UNUSUAL_WHALES_KEY</code> (~$50-200/mo). Both keys go in
            Secrets.
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="grid grid-cols-[2fr_1fr_auto] gap-3 px-4 py-3 bg-muted/50 border-b border-border">
              <span className="text-[10px] font-mono text-muted-foreground tracking-wider">SOURCE</span>
              <span className="text-[10px] font-mono text-muted-foreground tracking-wider">COST</span>
              <span className="text-[10px] font-mono text-muted-foreground tracking-wider">STATUS</span>
            </div>
            {Object.entries(statusData.sources ?? {}).map(([name, s]: [string, any]) => (
              <div
                key={name}
                className="grid grid-cols-[2fr_1fr_auto] gap-3 px-4 py-3 border-b border-border/50 last:border-0 items-center"
              >
                <div>
                  <div className="text-sm font-medium">{name.replace(/_/g, " ")}</div>
                  <div className="text-[10px] text-muted-foreground">{s.note}</div>
                </div>
                <div className="text-xs text-muted-foreground">{s.tier}</div>
                <div>
                  {s.status === "active" ? (
                    <span className="text-[10px] font-bold bg-success/15 text-success px-2 py-0.5 rounded-full border border-success/30">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-warning/15 text-warning px-2 py-0.5 rounded-full border border-warning/30">
                      Add key
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
