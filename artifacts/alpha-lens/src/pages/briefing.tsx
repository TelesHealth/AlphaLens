import { useState } from "react";
import { Link } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useGetBriefing,
  useTriggerScan,
  useGetGlobalEvents,
  useGetWatchlist,
  useRemoveFromWatchlist,
  useOpenTrade,
  useExecuteTrade,
  useGetTradingAccounts,
  useGetRoutingDecision,
  getGetBriefingQueryKey,
  getGetGlobalEventsQueryKey,
  getGetWatchlistQueryKey,
  getGetPortfolioQueryKey,
  getGetPortfolioStatsQueryKey,
  getGetPendingOrdersQueryKey,
  getGetTradeHistoryQueryKey,
  getGetTradingPositionsQueryKey,
  getGetTradingAccountsQueryKey,
  getGetRoutingDecisionQueryKey,
  type OpenTradeRequestDirection,
} from "@workspace/api-client-react";
import type {
  Recommendation,
  GlobalEvent,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Zap,
  Globe,
  Eye,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Target,
  ShieldAlert,
  Crosshair,
  Trash2,
} from "lucide-react";
import { cn, formatCurrency } from "@/components/ui-helpers";
import { useToast } from "@/hooks/use-toast";

function UrgencyBadge({ urgency }: { urgency?: string }) {
  const styles: Record<string, string> = {
    high: "bg-destructive/10 text-destructive border-destructive/20",
    medium: "bg-warning/10 text-warning border-warning/20",
    low: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded border",
        styles[urgency ?? "low"] ?? styles.low
      )}
    >
      {urgency ?? "low"}
    </span>
  );
}

function ImpactBadge({ level }: { level?: string }) {
  const styles: Record<string, string> = {
    critical:
      "bg-destructive/20 text-destructive border-destructive/30 shadow-[0_0_8px_rgba(239,68,68,0.2)]",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    medium: "bg-warning/10 text-warning border-warning/20",
    low: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded border",
        styles[level ?? "low"] ?? styles.low
      )}
    >
      {level}
    </span>
  );
}

const KALSHI_KEYWORDS = [
  "fed", "rate cut", "rate hike", "fomc", "cpi", "inflation", "pce",
  "unemployment", "payrolls", "jobs", "nonfarm", "gdp", "recession",
  "election", "president", "senate", "congress", "bitcoin", "btc",
  "ethereum", "eth", "crypto", "hurricane", "weather", "oil", "brent",
  "sp500", "s&p", "nasdaq", "dow", "stock market", "earnings",
];

function getPlatformBadge(rec: Recommendation): { label: string; color: string } {
  const title = (rec.title ?? "").toLowerCase();
  const assetClass = (rec.assetClass ?? "").toLowerCase();
  if (assetClass === "stock" || assetClass === "etf") {
    return { label: "ALPACA", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  }
  if (KALSHI_KEYWORDS.some(kw => title.includes(kw))) {
    return { label: "KALSHI", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
  }
  return { label: "PAPER", color: "bg-muted text-muted-foreground border-border" };
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const [expanded, setExpanded] = useState(false);
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [amountUsd, setAmountUsd] = useState<string>("50");
  const [amountErr, setAmountErr] = useState<string | null>(null);
  const [executeErr, setExecuteErr] = useState<string | null>(null);
  const [paperModalOpen, setPaperModalOpen] = useState(false);
  const [paperAmountUsd, setPaperAmountUsd] = useState<string>("50");
  const [paperAmountErr, setPaperAmountErr] = useState<string | null>(null);
  const platformBadge = getPlatformBadge(rec);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: accountsData } = useGetTradingAccounts({
    query: {
      queryKey: getGetTradingAccountsQueryKey(),
      // staleTime: 0 ensures we always see the freshest configured/not-configured
      // state right after the user connects a platform in /settings, instead of
      // showing a stale "Execute via PAPER" button from an earlier visit.
      staleTime: 0,
    },
  });
  const accounts = accountsData?.accounts;
  const hasLiveAccount =
    accounts?.kalshi?.status === "configured" ||
    accounts?.alpaca?.status === "configured" ||
    accounts?.polymarket?.status === "configured";

  const recId = rec.id;
  const { data: routingData } = useGetRoutingDecision(recId ?? 0, {
    query: {
      queryKey: getGetRoutingDecisionQueryKey(recId ?? 0),
      enabled: !!recId && hasLiveAccount,
      staleTime: 60_000,
    },
  });
  const targetPlatform = (
    routingData?.selectedPlatform ?? "paper"
  ).toUpperCase();

  const paperMutation = useOpenTrade({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Paper trade executed",
          description: `${formatCurrency(Number(paperAmountUsd) || 50)} on ${rec.title}`,
        });
        setPaperModalOpen(false);
        setPaperAmountErr(null);
        queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetPortfolioStatsQueryKey(),
        });
      },
      onError: (err: unknown) => {
        toast({
          title: "Paper trade failed",
          description: (err as Error)?.message ?? "Try again",
          variant: "destructive",
        });
      },
    },
  });

  const liveMutation = useExecuteTrade({
    mutation: {
      onSuccess: (result) => {
        if (result.status === "pending_approval") {
          toast({
            title: "Trade queued for approval",
            description: "Review it in the Trading page before it goes live.",
          });
          setLiveModalOpen(false);
          setExecuteErr(null);
        } else if (result.success) {
          toast({
            title: `Trade executed on ${(result.platform ?? "platform").toUpperCase()}`,
            description: result.message,
          });
          setLiveModalOpen(false);
          setExecuteErr(null);
        } else {
          // Risk gate or platform error returned 200 with success:false
          const msg =
            result.error ?? "Trade blocked. Adjust amount or check settings.";
          setExecuteErr(msg);
        }
        queryClient.invalidateQueries({
          queryKey: getGetPendingOrdersQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getGetTradeHistoryQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getGetTradingPositionsQueryKey(),
        });
      },
      onError: (err: unknown) => {
        setExecuteErr((err as Error)?.message ?? "Execute failed");
      },
    },
  });

  function openPaperModal() {
    if (recId == null) return;
    if (rec.assetId == null) {
      // Recommendation IDs are not asset IDs — POST /api/portfolio/trade
      // validates assetId against assetsTable. Without one we cannot paper
      // trade; surface the limitation rather than firing a 404.
      toast({
        title: "Paper trade unavailable",
        description:
          "This recommendation is not linked to a tradable asset.",
        variant: "destructive",
      });
      return;
    }
    setPaperAmountErr(null);
    setPaperAmountUsd("50");
    setPaperModalOpen(true);
  }

  function handleConfirmPaper() {
    const amount = Number(paperAmountUsd);
    if (!Number.isFinite(amount) || amount < 10) {
      setPaperAmountErr("Minimum amount is $10");
      return;
    }
    if (recId == null || rec.assetId == null) return;
    setPaperAmountErr(null);
    const direction: OpenTradeRequestDirection =
      rec.direction === "bearish" || rec.direction === "short" ? "short" : "long";
    paperMutation.mutate({
      data: {
        assetId: rec.assetId,
        direction,
        amount,
      },
    });
  }

  function openLiveModal() {
    setExecuteErr(null);
    setAmountErr(null);
    setAmountUsd("50");
    setLiveModalOpen(true);
  }

  function handleConfirmLive() {
    const amount = Number(amountUsd);
    if (!Number.isFinite(amount) || amount < 10) {
      setAmountErr("Minimum amount is $10");
      return;
    }
    if (recId == null) return;
    setAmountErr(null);
    setExecuteErr(null);
    liveMutation.mutate({
      data: {
        recommendationId: recId,
        amountUsd: amount,
        overrideApproval: false,
      },
    });
  }

  const typeConfig: Record<string, { icon: typeof Zap; color: string }> = {
    trade: {
      icon: Target,
      color: "text-primary border-primary/30 bg-primary/5",
    },
    watch: {
      icon: Eye,
      color: "text-warning border-warning/30 bg-warning/5",
    },
    avoid: {
      icon: ShieldAlert,
      color: "text-destructive border-destructive/30 bg-destructive/5",
    },
  };

  const config = typeConfig[rec.type ?? "watch"] ?? typeConfig.watch;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden transition-all duration-300",
        config.color
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
        className="w-full text-left p-4 hover:bg-secondary/30 transition-colors cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="mt-0.5 shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-secondary border border-border">
                  {rec.type}
                </span>
                <UrgencyBadge urgency={rec.urgency} />
                {rec.assetClass && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {rec.assetClass}
                  </span>
                )}
                <span className={cn("px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider rounded border", platformBadge.color)}>
                  {platformBadge.label}
                </span>
              </div>
              {rec.assetId != null ? (
                <Link
                  href={`/market/${rec.assetId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-sm leading-snug hover:text-primary hover:underline transition-colors block"
                >
                  {rec.title}
                </Link>
              ) : (
                <h3 className="font-semibold text-sm leading-snug">
                  {rec.title}
                </h3>
              )}
              {rec.assetTitle && (
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                  {rec.assetTitle}
                </div>
              )}
              {rec.headline && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2 prose prose-invert prose-xs max-w-none [&_p]:m-0 [&_strong]:text-foreground/90">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{rec.headline}</ReactMarkdown>
                </div>
              )}
              {rec.edgeChangeAlert?.hasAlert &&
                rec.edgeChangeAlert.previousEdge != null &&
                rec.edgeChangeAlert.currentEdge != null && (
                <div
                  className={cn(
                    "mt-2 flex items-start gap-2 rounded-md border px-2.5 py-1.5",
                    rec.edgeChangeAlert.direction === "widening"
                      ? "bg-success/10 border-success/30 text-success"
                      : "bg-warning/10 border-warning/30 text-warning",
                  )}
                  title={rec.edgeChangeAlert.message}
                >
                  {rec.edgeChangeAlert.direction === "widening" ? (
                    <TrendingUp className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  )}
                  <div className="text-[11px] leading-tight">
                    <div className="font-semibold">
                      {rec.edgeChangeAlert.direction === "widening"
                        ? "Edge widening — opportunity growing"
                        : "Edge narrowing — market closing the gap"}
                    </div>
                    <div className="font-mono text-[10px] opacity-80">
                      Was {rec.edgeChangeAlert.previousEdge.toFixed(1)} pts → now{" "}
                      {rec.edgeChangeAlert.currentEdge.toFixed(1)} pts (
                      {rec.edgeChangeAlert.minutesAgo ?? 0} min ago)
                    </div>
                  </div>
                </div>
              )}
              {rec.edgeExplanation && (
                <div
                  className="text-xs text-muted-foreground italic mt-1.5 line-clamp-2"
                  title={rec.edgeExplanation}
                  onClick={(e) => e.stopPropagation()}
                >
                  {rec.edgeExplanation}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {rec.direction && (
              <div className="flex items-center gap-1">
                {rec.direction === "long" || rec.direction === "bullish" ? (
                  <TrendingUp className="w-4 h-4 text-success" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-destructive" />
                )}
              </div>
            )}
            {rec.confidence != null && (
              <div className="text-right">
                <div
                  className={cn(
                    "text-lg font-bold font-mono",
                    rec.confidence >= 70
                      ? "text-success"
                      : rec.confidence >= 40
                        ? "text-warning"
                        : "text-destructive"
                  )}
                >
                  {rec.confidence}%
                </div>
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto text-xs text-muted-foreground">
              <span>{expanded ? "Hide analysis" : "Show analysis"}</span>
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {rec.convictionScore != null && (
              <div
                className="bg-primary/10 border border-primary/30 rounded-lg p-3 col-span-2 sm:col-span-1 row-span-2 sm:row-span-1 flex flex-col justify-between"
                title="Edge × Confidence — combined high-signal score"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono text-muted-foreground">
                    CONVICTION
                  </div>
                  {(() => {
                    const m = rec.edgeAgeMinutes;
                    if (m == null) return null;
                    const dot =
                      m < 30
                        ? "bg-success shadow-[0_0_6px_rgba(34,197,94,0.7)]"
                        : m < 120
                          ? "bg-warning"
                          : "bg-muted-foreground/60";
                    const label =
                      m < 30
                        ? "Live"
                        : m < 120
                          ? `${m} min ago`
                          : `${Math.floor(m / 60)} hr ago`;
                    return (
                      <span
                        className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground"
                        title={`Edge calculated ${label.toLowerCase()}`}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
                        {label}
                      </span>
                    );
                  })()}
                </div>
                <div
                  className={cn(
                    "text-2xl font-mono font-bold mt-1",
                    rec.convictionScore > 15
                      ? "text-success"
                      : rec.convictionScore > 0
                        ? "text-primary"
                        : "text-destructive",
                  )}
                >
                  {rec.convictionScore > 0 ? "+" : ""}
                  {rec.convictionScore.toFixed(1)}
                </div>
              </div>
            )}
            {rec.edge != null && (
              <div
                className="bg-secondary/30 rounded-lg p-3"
                title={
                  rec.edgeType === "probability_gap"
                    ? "AI probability vs market contract price"
                    : "AI directional confidence above neutral baseline"
                }
              >
                <div className="text-[10px] font-mono text-muted-foreground mb-1">
                  {rec.edgeType === "probability_gap"
                    ? "PROBABILITY GAP"
                    : "DIRECTIONAL EDGE"}
                </div>
                <div
                  className={cn(
                    "text-sm font-mono font-bold",
                    rec.edge > 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {rec.edge > 0 ? "+" : ""}
                  {rec.edge.toFixed(1)}
                  {rec.edgeType === "probability_gap" ? "%" : " pts"}
                </div>
              </div>
            )}
            {rec.aiProbability != null && (
              <div className="bg-secondary/30 rounded-lg p-3">
                <div className="text-[10px] font-mono text-muted-foreground mb-1">
                  AI PROBABILITY
                </div>
                <div className="text-sm font-mono font-bold">
                  {rec.aiProbability > 1
                    ? rec.aiProbability.toFixed(1)
                    : (rec.aiProbability * 100).toFixed(1)}
                  %
                </div>
              </div>
            )}
            {rec.marketPrice != null && (
              <div className="bg-secondary/30 rounded-lg p-3">
                <div className="text-[10px] font-mono text-muted-foreground mb-1">
                  {rec.assetClass === "prediction"
                    ? "MARKET PROBABILITY"
                    : rec.assetClass === "fx"
                      ? "CURRENT RATE"
                      : "CURRENT PRICE"}
                </div>
                <div className="text-sm font-mono font-bold">
                  {rec.assetClass === "prediction"
                    ? `${rec.marketPrice.toFixed(1)}%`
                    : rec.assetClass === "fx"
                      ? rec.marketPrice.toFixed(4)
                      : formatCurrency(rec.marketPrice)}
                </div>
              </div>
            )}
          </div>

          {rec.confidenceRationale && (
            <div className="rounded-md border border-border/50 bg-secondary/20 px-3 py-2">
              <div className="text-[10px] font-mono text-muted-foreground mb-1">
                WHY THIS CONFIDENCE LEVEL
              </div>
              <div className="text-xs text-foreground/80">
                {rec.confidenceRationale}
              </div>
            </div>
          )}

          {rec.why && rec.why.length > 0 && (
            <div>
              <div className="text-[10px] font-mono text-muted-foreground mb-2">
                WHY
              </div>
              <ul className="space-y-1">
                {rec.why.map((reason, i) => (
                  <li
                    key={i}
                    className="text-xs text-foreground/80 flex items-start gap-2"
                  >
                    <Crosshair className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                    <div className="prose prose-invert prose-xs max-w-none [&_p]:m-0 [&_strong]:text-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{reason}</ReactMarkdown>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rec.taSignal &&
            rec.assetClass !== "prediction" &&
            (() => {
              const ta = rec.taSignal as {
                rsi?: { value?: number; signal?: string } | null;
                macd?: { signal?: string } | null;
                movingAverages?: { signal?: string } | null;
                bollingerBands?: {
                  signal?: string;
                  bandWidth?: number;
                } | null;
                overallTASignal?: string;
                taBullishCount?: number;
                taBearishCount?: number;
                taNeutralCount?: number;
              };
              const bullSet = new Set([
                "oversold",
                "bullish_crossover",
                "building_momentum_up",
                "strong_uptrend",
                "golden_cross",
                "below_lower_band",
              ]);
              const bearSet = new Set([
                "overbought",
                "bearish_crossover",
                "building_momentum_down",
                "strong_downtrend",
                "death_cross",
                "above_upper_band",
              ]);
              const dot = (sig?: string) => {
                if (!sig) return "bg-muted-foreground/40";
                if (bullSet.has(sig)) return "bg-success";
                if (bearSet.has(sig)) return "bg-destructive";
                return "bg-muted-foreground/60";
              };
              const indicators: { label: string; sig?: string; tip: string }[] =
                [
                  {
                    label: "RSI",
                    sig: ta.rsi?.signal,
                    tip: `RSI: ${ta.rsi?.value ?? "n/a"} → ${ta.rsi?.signal ?? "n/a"}`,
                  },
                  {
                    label: "MACD",
                    sig: ta.macd?.signal,
                    tip: `MACD: ${ta.macd?.signal ?? "n/a"}`,
                  },
                  {
                    label: "MA",
                    sig: ta.movingAverages?.signal,
                    tip: `Moving averages: ${ta.movingAverages?.signal ?? "n/a"}`,
                  },
                  {
                    label: "BB",
                    sig: ta.bollingerBands?.signal,
                    tip: `Bollinger Bands: ${ta.bollingerBands?.signal ?? "n/a"}`,
                  },
                ];
              const overall = ta.overallTASignal ?? "mixed";
              const overallStyle: Record<string, { cls: string; label: string }> = {
                strongly_bullish: {
                  cls: "bg-success/20 text-success border-success/40",
                  label: "TA: Strong Buy",
                },
                bullish: {
                  cls: "bg-success/10 text-success border-success/30",
                  label: "TA: Bullish",
                },
                bearish: {
                  cls: "bg-destructive/10 text-destructive border-destructive/30",
                  label: "TA: Bearish",
                },
                strongly_bearish: {
                  cls: "bg-destructive/20 text-destructive border-destructive/40",
                  label: "TA: Strong Sell",
                },
                mixed: {
                  cls: "bg-secondary/40 text-muted-foreground border-border",
                  label: "TA: Mixed",
                },
              };
              const ov = overallStyle[overall] ?? overallStyle.mixed;
              return (
                <div className="rounded-md border border-border/50 bg-secondary/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="text-[10px] font-mono text-muted-foreground">
                        TECHNICAL SIGNALS
                      </div>
                      <div className="flex items-center gap-3">
                        {indicators.map((ind) => (
                          <div
                            key={ind.label}
                            className="flex items-center gap-1"
                            title={ind.tip}
                          >
                            <span
                              className={cn("w-2 h-2 rounded-full", dot(ind.sig))}
                            />
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {ind.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border",
                        ov.cls,
                      )}
                      title={`${ta.taBullishCount ?? 0} bullish / ${ta.taBearishCount ?? 0} bearish / ${ta.taNeutralCount ?? 0} neutral`}
                    >
                      {ov.label}
                    </span>
                  </div>
                </div>
              );
            })()}

          {rec.danelfinScore &&
            rec.assetClass !== "prediction" &&
            rec.assetClass !== "crypto" &&
            rec.assetClass !== "fx" &&
            (() => {
              const ds = rec.danelfinScore as {
                aiScore?: number;
                technical?: number;
                fundamental?: number;
                sentiment?: number;
                lowRisk?: number;
                signal?: string;
              };
              const ai = ds.aiScore ?? 0;
              const signal = ds.signal ?? "hold";
              const style =
                signal === "strong_buy"
                  ? {
                      cls: "bg-success/20 text-success border-success/40",
                      label: "Danelfin: Strong Buy",
                    }
                  : signal === "buy"
                    ? {
                        cls: "bg-success/10 text-success border-success/30",
                        label: "Danelfin: Buy",
                      }
                    : signal === "neutral"
                      ? {
                          cls: "bg-secondary/40 text-muted-foreground border-border",
                          label: "Danelfin: Neutral",
                        }
                      : signal === "strong_sell"
                        ? {
                            cls: "bg-destructive/20 text-destructive border-destructive/40",
                            label: "Danelfin: Strong Sell",
                          }
                        : signal === "sell"
                          ? {
                              cls: "bg-destructive/15 text-destructive border-destructive/30",
                              label: "Danelfin: Sell",
                            }
                          : {
                              cls: "bg-warning/15 text-warning border-warning/30",
                              label: "Danelfin: Hold",
                            };
              return (
                <div className="rounded-md border border-border/50 bg-secondary/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="text-[10px] font-mono text-muted-foreground">
                        DANELFIN AI
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                        <span title="Overall AI score">
                          AI: <span className="text-foreground">{ds.aiScore ?? "-"}/10</span>
                        </span>
                        <span title="Technical score">
                          T: <span className="text-foreground">{ds.technical ?? "-"}</span>
                        </span>
                        <span title="Fundamental score">
                          F: <span className="text-foreground">{ds.fundamental ?? "-"}</span>
                        </span>
                        <span title="Sentiment score">
                          S: <span className="text-foreground">{ds.sentiment ?? "-"}</span>
                        </span>
                        <span title="Low-risk score (higher = lower risk)">
                          LR: <span className="text-foreground">{ds.lowRisk ?? "-"}</span>
                        </span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border",
                        style.cls,
                      )}
                      title={`Danelfin AI score ${ai}/10 → ${ds.signal ?? "n/a"}`}
                    >
                      {style.label}
                    </span>
                  </div>
                </div>
              );
            })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {rec.historicalContext && (
              <div>
                <div className="text-[10px] font-mono text-muted-foreground mb-1">
                  HISTORICAL CONTEXT
                </div>
                <div className="text-foreground/70 prose prose-invert prose-xs max-w-none [&_p]:m-0 [&_strong]:text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{rec.historicalContext}</ReactMarkdown>
                </div>
              </div>
            )}
            {rec.bearCase && (
              <div>
                <div className="text-[10px] font-mono text-muted-foreground mb-1">
                  BEAR CASE
                </div>
                <div className="text-foreground/70 prose prose-invert prose-xs max-w-none [&_p]:m-0 [&_strong]:text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{rec.bearCase}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
            {rec.window && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {rec.window}
              </span>
            )}
            {rec.entryTrigger && (
              <span className="flex items-center gap-1">
                <Crosshair className="w-3 h-3" /> {rec.entryTrigger}
              </span>
            )}
          </div>
        </div>
      )}

      {rec.type === "trade" && recId != null && (
        <div className="px-4 pb-4 pt-1 flex flex-col sm:flex-row gap-2 border-t border-border/50">
          <button
            type="button"
            onClick={openPaperModal}
            disabled={paperMutation.isPending}
            data-testid={`btn-paper-trade-${recId}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/70 border border-border text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Target className="w-4 h-4" />
            {paperMutation.isPending ? "Submitting…" : "Paper Trade"}
          </button>

          {hasLiveAccount ? (
            <button
              type="button"
              onClick={openLiveModal}
              data-testid={`btn-live-trade-${recId}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary text-sm font-medium transition-colors"
            >
              <Zap className="w-4 h-4" />
              Execute via {targetPlatform}
            </button>
          ) : (
            <Link
              href="/settings"
              data-testid={`link-connect-trading-${recId}`}
              title="Connect a trading account in Settings to enable live trading"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-muted/50 border border-border text-muted-foreground text-sm font-medium hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Zap className="w-4 h-4" />
              Connect to Live Trade
            </Link>
          )}
        </div>
      )}

      {recId != null && (
        <Dialog
          open={liveModalOpen}
          onOpenChange={(open) => {
            setLiveModalOpen(open);
            if (!open) setExecuteErr(null);
          }}
        >
          <DialogContent
            className="max-w-md"
            data-testid={`live-trade-modal-${recId}`}
          >
            <DialogHeader>
              <DialogTitle>Execute Live Trade</DialogTitle>
              <DialogDescription>
                Review the trade details before submitting.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
                    Asset
                  </div>
                  <div className="font-medium leading-snug">{rec.title}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
                    Platform
                  </div>
                  <div className="font-mono font-bold">{targetPlatform}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
                    Direction
                  </div>
                  <div className="font-mono uppercase">
                    {rec.direction ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
                    AI Confidence
                  </div>
                  <div className="font-mono">
                    {rec.confidence != null ? `${rec.confidence}%` : "—"}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor={`amount-input-${recId}`}
                  className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground"
                >
                  Amount (USD, min $10)
                </label>
                <Input
                  id={`amount-input-${recId}`}
                  type="number"
                  min={10}
                  step={5}
                  value={amountUsd}
                  onChange={(e) => {
                    setAmountUsd(e.target.value);
                    setAmountErr(null);
                  }}
                  data-testid={`input-amount-${recId}`}
                  className="mt-1 font-mono"
                />
                {amountErr && (
                  <div className="text-xs text-destructive mt-1">{amountErr}</div>
                )}
              </div>

              {routingData?.reason && (
                <div className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
                  <span className="font-mono uppercase text-[10px] tracking-wider">
                    Routing:
                  </span>{" "}
                  {routingData.reason}
                </div>
              )}

              <div className="text-xs text-muted-foreground bg-secondary/30 rounded p-2">
                Risk gate: All checks will run automatically.
              </div>

              {routingData?.requireApproval !== false && (
                <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded p-2 flex gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    This trade requires your approval before executing. Review
                    it on the Trading page before it goes live.
                  </span>
                </div>
              )}

              {executeErr && (
                <div
                  className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2"
                  data-testid={`execute-error-${recId}`}
                >
                  {executeErr}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => setLiveModalOpen(false)}
                disabled={liveMutation.isPending}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/70 text-sm font-medium transition-colors disabled:opacity-50"
                data-testid={`btn-cancel-live-${recId}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLive}
                disabled={liveMutation.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors disabled:opacity-50"
                data-testid={`btn-confirm-live-${recId}`}
              >
                {liveMutation.isPending ? "Submitting…" : "Confirm"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {recId != null && (
        <Dialog
          open={paperModalOpen}
          onOpenChange={(open) => {
            setPaperModalOpen(open);
            if (!open) setPaperAmountErr(null);
          }}
        >
          <DialogContent
            className="max-w-md"
            data-testid={`paper-trade-modal-${recId}`}
          >
            <DialogHeader>
              <DialogTitle>Paper Trade</DialogTitle>
              <DialogDescription>
                Simulated trade with no real funds. Enter the amount to allocate.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
                    Asset
                  </div>
                  <div className="font-medium leading-snug">{rec.title}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
                    Direction
                  </div>
                  <div className="font-mono uppercase">
                    {rec.direction ?? "—"}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor={`paper-amount-input-${recId}`}
                  className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground"
                >
                  Amount (USD, min $10)
                </label>
                <Input
                  id={`paper-amount-input-${recId}`}
                  type="number"
                  min={10}
                  step={5}
                  value={paperAmountUsd}
                  onChange={(e) => {
                    setPaperAmountUsd(e.target.value);
                    setPaperAmountErr(null);
                  }}
                  data-testid={`input-paper-amount-${recId}`}
                  className="mt-1 font-mono"
                />
                {paperAmountErr && (
                  <div className="text-xs text-destructive mt-1">
                    {paperAmountErr}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => setPaperModalOpen(false)}
                disabled={paperMutation.isPending}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/70 text-sm font-medium transition-colors disabled:opacity-50"
                data-testid={`btn-cancel-paper-${recId}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPaper}
                disabled={
                  paperMutation.isPending ||
                  !Number.isFinite(Number(paperAmountUsd)) ||
                  Number(paperAmountUsd) < 10
                }
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors disabled:opacity-50"
                data-testid={`btn-confirm-paper-${recId}`}
              >
                {paperMutation.isPending ? "Submitting…" : "Confirm"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function EventCard({ event }: { event: GlobalEvent }) {
  const directionIcon =
    event.direction === "bullish" ? (
      <TrendingUp className="w-4 h-4 text-success" />
    ) : event.direction === "bearish" ? (
      <TrendingDown className="w-4 h-4 text-destructive" />
    ) : (
      <AlertTriangle className="w-4 h-4 text-warning" />
    );

  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:bg-secondary/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5">{directionIcon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <ImpactBadge level={event.impactLevel} />
              {event.region && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {event.region}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold">{event.title}</h3>
            {event.detail && (
              <p className="text-xs text-muted-foreground mt-1">
                {event.detail}
              </p>
            )}
            {event.affectedAssets && event.affectedAssets.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {event.affectedAssets.map((asset, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary border border-border"
                  >
                    {asset}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {event.timeContext && (
          <span className="text-[10px] text-muted-foreground font-mono shrink-0 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {event.timeContext}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Briefing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: briefing,
    isLoading,
    error,
  } = useGetBriefing({
    query: { queryKey: getGetBriefingQueryKey(), refetchInterval: 60000 },
  });

  const { data: eventsData } = useGetGlobalEvents(
    { limit: 10 },
    { query: { queryKey: getGetGlobalEventsQueryKey({ limit: 10 }), refetchInterval: 120000 } }
  );

  const { data: watchlistData } = useGetWatchlist({
    query: { queryKey: getGetWatchlistQueryKey(), refetchInterval: 60000 },
  });

  const removeWatchlistMutation = useRemoveFromWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: "Removed", description: "Asset removed from watchlist." });
      },
      onError: () => {
        toast({ title: "Error", description: "Could not remove from watchlist.", variant: "destructive" });
      },
    },
  });

  const scanMutation = useTriggerScan({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Scan Initiated",
          description:
            "AI is scanning global markets. Results will appear shortly.",
        });
        setTimeout(async () => {
          await queryClient.invalidateQueries({
            predicate: (query) =>
              (query.queryKey[0] as string)?.startsWith?.(
                "/api/recommendations"
              ) ?? false,
          });
          const cached = queryClient.getQueryData<{ recommendations?: unknown[] }>(getGetBriefingQueryKey());
          const count = cached?.recommendations?.length ?? 0;
          toast({ title: "Scan Complete", description: `${count} recommendations generated.` });
        }, 15000);
      },
      onError: (err: unknown) => {
        // 409 { status: "scan_already_running" } is *expected* when the user
        // double-clicks or a cron run is mid-flight — surface it as a neutral
        // notice, not a red error.
        const apiErr = err as {
          status?: number;
          data?: { status?: string; message?: string } | null;
        };
        if (
          apiErr?.status === 409 &&
          apiErr?.data?.status === "scan_already_running"
        ) {
          toast({
            title: "Scan in progress",
            description:
              apiErr.data.message ?? "Please wait for the current scan to finish.",
          });
          return;
        }
        toast({
          title: "Scan Failed",
          description: "Could not start market scan.",
          variant: "destructive",
        });
      },
    },
  });

  const trades =
    briefing?.recommendations?.filter(
      (r: Recommendation) => r.type === "trade"
    ) ?? [];
  const watches =
    briefing?.recommendations?.filter(
      (r: Recommendation) => r.type === "watch"
    ) ?? [];
  const avoids =
    briefing?.recommendations?.filter(
      (r: Recommendation) => r.type === "avoid"
    ) ?? [];

  const events = eventsData?.events ?? briefing?.globalEvents ?? [];
  const watchlist = watchlistData?.watchlist ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-muted-foreground font-mono text-sm">
            Loading intelligence briefing...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4 max-w-md">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-destructive">Failed to load briefing</p>
          <p className="text-xs text-muted-foreground">
            {(error as Error).message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-display text-glow-primary">
            Intelligence Briefing
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered daily market intelligence and trade recommendations.
          </p>
        </div>
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30 hover:bg-primary/20 text-sm font-medium transition-all group disabled:opacity-50"
        >
          <Zap
            className={cn(
              "w-4 h-4 text-primary",
              scanMutation.isPending && "animate-pulse"
            )}
          />
          {scanMutation.isPending ? "Scanning..." : "Run AI Scan"}
        </button>
      </div>

      {briefing?.summary && (
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-xl shadow-black/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-[80px] -mr-24 -mt-24 pointer-events-none" />
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-muted-foreground">
              BRIEFING SUMMARY
            </span>
            {briefing.scanNumber != null && briefing.scanNumber > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                SCAN #{briefing.scanNumber}
              </span>
            )}
          </div>
          <div className="text-sm text-foreground/90 leading-relaxed prose prose-invert prose-sm max-w-none [&_p]:m-0 [&_p+p]:mt-2 [&_strong]:text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.summary}</ReactMarkdown>
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-muted-foreground">
            {briefing.tradeCount != null && (
              <span>{briefing.tradeCount} trades</span>
            )}
            {briefing.watchCount != null && (
              <span>{briefing.watchCount} watches</span>
            )}
            {briefing.generatedAt && (
              <span className="ml-auto">
                {new Date(briefing.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {trades.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono font-bold tracking-wider text-muted-foreground">
                  TRADE CALLS ({trades.length})
                </h2>
              </div>
              <div className="space-y-3">
                {trades.map((rec: Recommendation) => (
                  <RecommendationCard key={rec.id} rec={rec} />
                ))}
              </div>
            </section>
          )}

          {watches.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-warning" />
                <h2 className="text-sm font-mono font-bold tracking-wider text-muted-foreground">
                  WATCH LIST ({watches.length})
                </h2>
              </div>
              <div className="space-y-3">
                {watches.map((rec: Recommendation) => (
                  <RecommendationCard key={rec.id} rec={rec} />
                ))}
              </div>
            </section>
          )}

          {avoids.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-destructive" />
                <h2 className="text-sm font-mono font-bold tracking-wider text-muted-foreground">
                  AVOID ({avoids.length})
                </h2>
              </div>
              <div className="space-y-3">
                {avoids.map((rec: Recommendation) => (
                  <RecommendationCard key={rec.id} rec={rec} />
                ))}
              </div>
            </section>
          )}

          {trades.length === 0 &&
            watches.length === 0 &&
            avoids.length === 0 && (
              <div className="bg-card border border-border rounded-xl p-8 text-center">
                <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  No recommendations yet. Click "Run AI Scan" to generate your
                  first intelligence briefing.
                </p>
              </div>
            )}
        </div>

        <div className="space-y-6">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-mono font-bold tracking-wider text-muted-foreground">
                GLOBAL EVENTS
              </h2>
            </div>
            {events.length > 0 ? (
              <div className="space-y-3">
                {events.map((event: GlobalEvent) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-6 text-center">
                <Globe className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  No events scanned yet
                </p>
              </div>
            )}
          </section>

          {watchlist.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono font-bold tracking-wider text-muted-foreground">
                  MY WATCHLIST ({watchlist.length})
                </h2>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {watchlist.map((item) => (
                  <div key={item.id} className="p-3 hover:bg-secondary/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">
                          {item.assetTitle}
                        </div>
                        {item.assetClass && (
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {item.assetClass}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.alertEdgeThreshold != null && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            Edge ≥{item.alertEdgeThreshold}%
                          </span>
                        )}
                        <button
                          onClick={() => removeWatchlistMutation.mutate({ id: item.id })}
                          disabled={removeWatchlistMutation.isPending}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                          title="Remove from watchlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
