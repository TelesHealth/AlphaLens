import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetLeaderboard,
  getGetLeaderboardQueryKey,
  type LeaderboardResponse,
  type LeaderboardCalibrationBucket,
  type Recommendation,
} from "@workspace/api-client-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ArrowRight,
  LogIn,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/components/ui-helpers";

type FilterTab = "all" | "open" | "correct" | "incorrect";

function fmtPct(n: number | null | undefined, opts?: { sign?: boolean }): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = opts?.sign && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtNumber(n: number | null | undefined, decimals = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(decimals);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateLong(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function winRateColor(rate: number): string {
  if (rate >= 60) return "text-success";
  if (rate >= 50) return "text-warning";
  return "text-destructive";
}

function winRateGlow(rate: number): string {
  if (rate >= 60) return "drop-shadow-[0_0_12px_rgba(34,197,94,0.45)]";
  if (rate >= 50) return "drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]";
  return "drop-shadow-[0_0_12px_rgba(239,68,68,0.45)]";
}

function moneyColor(n: number): string {
  if (n > 0) return "text-success";
  if (n < 0) return "text-destructive";
  return "text-muted-foreground";
}

function OutcomeBadge({ outcome }: { outcome: string | null | undefined }) {
  if (!outcome) {
    return (
      <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded border bg-muted text-muted-foreground border-border font-mono">
        Open
      </span>
    );
  }
  const styles: Record<string, string> = {
    correct: "bg-success/10 text-success border-success/30",
    incorrect: "bg-destructive/10 text-destructive border-destructive/30",
    partial: "bg-warning/10 text-warning border-warning/30",
  };
  return (
    <span
      className={cn(
        "px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded border font-mono",
        styles[outcome] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {outcome}
    </span>
  );
}

function HeroStats({ stats }: { stats: LeaderboardResponse["stats"] }) {
  const progressPct = Math.min(
    100,
    Math.round((stats.daysElapsed / 90) * 100),
  );
  const winRate = stats.winRate;
  const totalReturn = stats.totalPaperReturn;

  return (
    <div className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm overflow-hidden">
      {/* Top bar: track record period & day count */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-6 pt-5 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            Track Record
          </span>
          <span className="font-mono text-sm text-foreground">
            {fmtDateLong(stats.trackRecordStart)} — {fmtDateLong(stats.trackRecordEnd)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            Day {stats.daysElapsed} of 90
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/70">
            ({stats.daysRemaining} remaining)
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 pt-3">
        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Hero number — Win Rate (largest element) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr] gap-0 px-6 pt-6 pb-6">
        <div className="lg:border-r lg:border-border/60 lg:pr-6 mb-6 lg:mb-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Win Rate
          </div>
          <div
            className={cn(
              "font-mono font-bold text-6xl md:text-7xl leading-none tabular-nums break-all",
              winRateColor(winRate),
              winRateGlow(winRate),
            )}
            data-testid="stat-win-rate"
          >
            {fmtPct(winRate)}
          </div>
          {stats.resolvedCalls > 0 && (
            <div className="text-xs font-mono text-muted-foreground mt-3">
              {stats.correctCalls} of {stats.resolvedCalls} resolved · w/ partial:{" "}
              <span className="text-foreground">
                {fmtPct(stats.winRateWithPartial)}
              </span>
            </div>
          )}
        </div>

        <StatTile
          label="Calls Made"
          value={String(stats.totalCalls)}
        />
        <StatTile
          label="Resolved"
          value={String(stats.resolvedCalls)}
          sub={stats.openCalls > 0 ? `${stats.openCalls} open` : undefined}
        />
        <StatTile
          label="Paper Return"
          value={fmtMoney(totalReturn)}
          sub={
            stats.paperReturnEligibleCalls > 0
              ? `${fmtPct(stats.paperReturnPct, { sign: true })} · based on ${stats.paperReturnEligibleCalls} call${stats.paperReturnEligibleCalls === 1 ? "" : "s"} with verified entry price${stats.paperReturnExcludedCalls > 0 ? ` (${stats.paperReturnExcludedCalls} legacy excluded)` : ""}`
              : stats.paperReturnExcludedCalls > 0
                ? `${stats.paperReturnExcludedCalls} legacy call${stats.paperReturnExcludedCalls === 1 ? "" : "s"} excluded — no verified entry price`
                : undefined
          }
          valueClass={moneyColor(totalReturn)}
        />
        <StatTile label="Avg Edge" value={`${fmtNumber(stats.avgEdge)} pts`} />
        <StatTile
          label="Avg Conviction"
          value={fmtNumber(stats.avgConvictionScore)}
          sub={
            stats.highConvictionWinRate != null ||
            stats.lowConvictionWinRate != null
              ? `Hi >15: ${fmtPct(stats.highConvictionWinRate)} · Lo <10: ${fmtPct(stats.lowConvictionWinRate)}`
              : undefined
          }
        />
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="lg:px-6 lg:border-r lg:border-border/60 last:border-r-0">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1">
        {label}
      </div>
      <div className={cn("font-mono font-bold text-3xl leading-tight", valueClass)}>
        {value}
      </div>
      {sub && (
        <div className="text-xs font-mono text-muted-foreground mt-1">{sub}</div>
      )}
    </div>
  );
}

function CalibrationChart({
  buckets,
}: {
  buckets: LeaderboardCalibrationBucket[];
}) {
  // Predicted midpoint for each bucket (rough)
  const data = buckets.map((b) => {
    const midMap: Record<string, number> = {
      "60-69%": 65,
      "70-79%": 75,
      "80%+": 87,
    };
    return {
      bucket: b.bucket,
      predicted: midMap[b.bucket] ?? 0,
      actual: b.rate,
      calls: b.calls,
      correct: b.correct,
    };
  });

  return (
    <div className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-6">
      <div className="mb-4">
        <h2 className="text-lg font-display font-bold tracking-wide">
          Is the AI calibrated?
        </h2>
        <p className="text-xs text-muted-foreground mt-1 font-mono">
          Predicted probability vs actual win rate · diagonal = perfect calibration
        </p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="bucket"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}
            />
            <RechartsTooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
              }}
              formatter={(value: any, name: string, props: any) => {
                if (name === "actual") {
                  const p = props?.payload;
                  return [
                    `${value}% (${p?.correct}/${p?.calls})`,
                    "Actual win rate",
                  ];
                }
                return [`${value}%`, name];
              }}
            />
            <ReferenceLine
              segment={[
                { x: "60-69%", y: 65 },
                { x: "80%+", y: 87 },
              ]}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{
                value: "perfect",
                position: "insideTopRight",
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
                fontFamily: "ui-monospace, monospace",
              }}
            />
            <Bar dataKey="actual" radius={[6, 6, 0, 0]}>
              {data.map((entry, i) => {
                const diff = entry.actual - entry.predicted;
                const fill =
                  entry.calls === 0
                    ? "hsl(var(--muted))"
                    : Math.abs(diff) <= 5
                      ? "hsl(var(--success))"
                      : diff < 0
                        ? "hsl(var(--destructive))"
                        : "hsl(var(--primary))";
                return <Cell key={`cell-${i}`} fill={fill} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 text-xs font-mono">
        {buckets.map((b) => (
          <div
            key={b.bucket}
            className="rounded-lg bg-secondary/40 border border-border/60 p-3"
          >
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">
              {b.bucket}
            </div>
            <div className="text-foreground font-bold mt-1">
              {b.calls > 0 ? `${b.rate.toFixed(1)}%` : "—"}
            </div>
            <div className="text-muted-foreground/80 text-[10px] mt-0.5">
              {b.correct}/{b.calls} correct
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DirectionChip({ direction }: { direction?: string | null }) {
  const d = (direction ?? "WATCH").toUpperCase();
  const style =
    d === "BULLISH" || d === "LONG"
      ? "text-success border-success/30 bg-success/10"
      : d === "BEARISH" || d === "SHORT"
        ? "text-destructive border-destructive/30 bg-destructive/10"
        : "text-muted-foreground border-border bg-muted/30";
  const Icon = d === "BULLISH" || d === "LONG" ? TrendingUp : d === "BEARISH" || d === "SHORT" ? TrendingDown : Activity;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[10px] uppercase tracking-wider",
        style,
      )}
    >
      <Icon className="w-3 h-3" />
      {d}
    </span>
  );
}

function rowBorder(outcome: string | null | undefined): string {
  if (outcome === "correct") return "border-l-2 border-l-success/60";
  if (outcome === "incorrect") return "border-l-2 border-l-destructive/60";
  if (outcome === "partial") return "border-l-2 border-l-warning/60";
  return "border-l-2 border-l-transparent opacity-80";
}

function RecommendationRow({ rec }: { rec: Recommendation }) {
  const [expanded, setExpanded] = useState(false);

  const entryToResolutionDays = useMemo(() => {
    if (!rec.createdAt || !rec.resolutionDate) return null;
    const a = new Date(rec.createdAt).getTime();
    const b = new Date(rec.resolutionDate).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
  }, [rec.createdAt, rec.resolutionDate]);

  return (
    <div
      className={cn(
        "rounded-lg bg-card/40 hover:bg-card/70 transition border border-border/60",
        rowBorder(rec.outcome),
      )}
      data-testid={`leaderboard-row-${rec.id}`}
    >
      {/* Desktop row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left grid grid-cols-12 gap-2 items-center px-3 py-3 hover:bg-secondary/20 rounded-lg"
      >
        <div className="col-span-2 md:col-span-1 text-xs font-mono text-muted-foreground">
          {fmtDate(rec.createdAt)}
        </div>
        <div className="col-span-10 md:col-span-3 min-w-0">
          <div className="text-sm font-medium truncate">
            {rec.assetTitle || rec.title}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {rec.assetClass || rec.type}
          </div>
        </div>
        <div className="hidden md:block md:col-span-1">
          <DirectionChip direction={rec.direction} />
        </div>
        <div className="hidden md:block md:col-span-1 text-right font-mono text-xs">
          {fmtNumber(rec.aiProbability)}%
        </div>
        <div className="hidden md:block md:col-span-1 text-right font-mono text-xs text-muted-foreground">
          {fmtNumber(rec.marketPrice)}
        </div>
        <div className="hidden md:block md:col-span-1 text-right font-mono text-xs">
          <span
            className={cn(
              typeof rec.edge === "number" && rec.edge > 0
                ? "text-success"
                : "text-muted-foreground",
            )}
          >
            {fmtNumber(rec.edge)}
          </span>
          {rec.convictionScore != null && (
            <div
              className={cn(
                "text-[10px] font-mono mt-0.5",
                rec.convictionScore > 15
                  ? "text-success"
                  : rec.convictionScore > 0
                    ? "text-primary"
                    : "text-muted-foreground/70",
              )}
              title="Conviction score: Edge × AI Confidence — combined signal strength"
            >
              c:{fmtNumber(rec.convictionScore)}
            </div>
          )}
        </div>
        <div className="hidden md:block md:col-span-1 text-right font-mono text-xs text-muted-foreground">
          {fmtNumber(rec.confidence, 0)}
        </div>
        <div className="col-span-6 md:col-span-1 flex md:justify-center">
          <OutcomeBadge outcome={rec.outcome} />
        </div>
        <div className="col-span-4 md:col-span-1 text-right font-mono text-xs">
          {rec.outcome ? (
            <span className={moneyColor(rec.paperReturn ?? 0)}>
              {fmtMoney(rec.paperReturn)}
            </span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
        </div>
        <div className="col-span-2 md:col-span-1 flex justify-end">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/60 mt-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Resolution
              </div>
              {rec.resolutionNote ? (
                <div className="text-foreground">{rec.resolutionNote}</div>
              ) : (
                <div className="text-muted-foreground italic">
                  {rec.outcome
                    ? "No note recorded"
                    : "Awaiting outcome — event has not yet resolved."}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Price at resolution
              </div>
              <div className="font-mono">
                {rec.marketPriceAtResolution != null ? (
                  <>
                    <span className="text-foreground">
                      {fmtNumber(rec.marketPriceAtResolution)}
                    </span>
                    {rec.marketPrice != null && (
                      <span className="text-muted-foreground ml-2">
                        (entry: {fmtNumber(rec.marketPrice)})
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Time to resolution
              </div>
              <div className="font-mono">
                {entryToResolutionDays != null
                  ? `${entryToResolutionDays} day${entryToResolutionDays === 1 ? "" : "s"}`
                  : rec.outcome
                    ? "—"
                    : "still open"}
              </div>
            </div>
          </div>
          {rec.window && (
            <div className="mt-3 text-[11px] font-mono text-muted-foreground">
              Window: <span className="text-foreground">{rec.window}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active: FilterTab;
  onChange: (t: FilterTab) => void;
  counts: { all: number; open: number; correct: number; incorrect: number };
}) {
  const tabs: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "open", label: "Open", count: counts.open },
    { key: "correct", label: "Correct", count: counts.correct },
    { key: "incorrect", label: "Incorrect", count: counts.incorrect },
  ];
  return (
    <div className="inline-flex rounded-lg bg-secondary/40 border border-border/60 p-1 font-mono text-xs">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "px-3 py-1.5 rounded-md transition uppercase tracking-wider",
            active === t.key
              ? "bg-background text-foreground border border-border shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={`filter-tab-${t.key}`}
        >
          {t.label}{" "}
          <span className="ml-1 text-muted-foreground/70">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

function PublicHeader({ user }: { user: ReturnType<typeof useAuth>["user"] }) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/60">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between px-4 md:px-8 h-14">
        <Link
          href={user ? "/briefing" : "/leaderboard"}
          className="flex items-center gap-2.5 group"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/30 flex items-center justify-center shadow-[0_0_12px_rgba(59,130,246,0.2)]">
            <span className="font-display font-bold text-primary text-glow-primary text-base leading-none">
              A
            </span>
          </div>
          <span className="font-display font-bold tracking-wider text-base md:text-lg">
            ARCLION
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 ml-3 px-2 py-0.5 rounded border border-border/60 bg-secondary/30 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Track Record
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href="/briefing"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 border border-primary/30 text-primary font-mono text-xs uppercase tracking-wider transition"
            >
              Briefing <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 font-mono text-xs uppercase tracking-wider transition"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs uppercase tracking-wider transition shadow-[0_0_10px_rgba(59,130,246,0.3)]"
              >
                Get Access
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterTab>("all");

  const { data, isLoading, error } = useGetLeaderboard(undefined, {
    query: {
      queryKey: getGetLeaderboardQueryKey(),
      refetchInterval: 60_000,
      retry: false,
    },
  });

  const stats = data?.stats;
  const calibration = data?.calibration ?? [];
  const recommendations = data?.recommendations ?? [];

  const filteredRecs = useMemo(() => {
    if (filter === "all") return recommendations;
    if (filter === "open") return recommendations.filter((r) => r.outcome == null);
    if (filter === "correct")
      return recommendations.filter((r) => r.outcome === "correct");
    if (filter === "incorrect")
      return recommendations.filter((r) => r.outcome === "incorrect");
    return recommendations;
  }, [recommendations, filter]);

  const counts = useMemo(() => {
    return {
      all: recommendations.length,
      open: recommendations.filter((r) => r.outcome == null).length,
      correct: recommendations.filter((r) => r.outcome === "correct").length,
      incorrect: recommendations.filter((r) => r.outcome === "incorrect").length,
    };
  }, [recommendations]);

  const showCalibration =
    stats != null && stats.resolvedCalls >= 10 && calibration.some((c) => c.calls > 0);
  const showEmptyState = stats != null && stats.resolvedCalls === 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {!user && <PublicHeader user={user} />}

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 md:px-8 py-6 md:py-10 space-y-6 md:space-y-8 overflow-x-hidden">
        {isLoading && (
          <div className="rounded-2xl border border-border bg-card/40 p-12 text-center text-sm text-muted-foreground font-mono">
            Loading track record…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
            Could not load the leaderboard. Please refresh.
          </div>
        )}

        {stats && (
          <>
            <HeroStats stats={stats} />

            {showCalibration && <CalibrationChart buckets={calibration} />}

            {/* Recommendations table */}
            <div className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-6 pt-5 pb-4 border-b border-border/60">
                <div>
                  <h2 className="text-lg font-display font-bold tracking-wide">
                    {showEmptyState ? "Live calls — currently watching" : "Every call, logged the moment it was made"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    {showEmptyState
                      ? "First outcomes will appear as the AI's predictions resolve. The track record started " +
                        fmtDateLong(stats.trackRecordStart) +
                        "."
                      : `${stats.resolvedCalls} resolved · ${stats.openCalls} open · sorted resolved-first`}
                  </p>
                </div>
                <FilterTabs active={filter} onChange={setFilter} counts={counts} />
              </div>

              {/* Header row (desktop) */}
              <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <div className="col-span-1">Date</div>
                <div className="col-span-3">Asset</div>
                <div className="col-span-1">Direction</div>
                <div className="col-span-1 text-right">AI Prob</div>
                <div className="col-span-1 text-right">Market</div>
                <div className="col-span-1 text-right">Edge</div>
                <div className="col-span-1 text-right">Conf</div>
                <div className="col-span-1 text-center">Status</div>
                <div className="col-span-1 text-right">Paper Ret</div>
                <div className="col-span-1" />
              </div>

              <div className="p-3 space-y-2">
                {filteredRecs.length === 0 ? (
                  <div className="text-center text-xs font-mono text-muted-foreground py-12">
                    No calls match this filter yet.
                  </div>
                ) : (
                  filteredRecs.map((rec) => (
                    <RecommendationRow key={rec.id} rec={rec} />
                  ))
                )}
              </div>
            </div>

            {/* Empty-state extra context */}
            {showEmptyState && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div className="text-sm text-foreground/90">
                    No outcomes resolved yet — that's expected. The 90-day track
                    record window opened on{" "}
                    <span className="font-mono">
                      {fmtDateLong(stats.trackRecordStart)}
                    </span>
                    . Above are the open calls the AI is currently watching, with
                    the AI probability and edge it assigned at the moment of
                    publication.
                  </div>
                </div>
              </div>
            )}

            {/* Sharing CTA */}
            <div className="rounded-2xl border border-border bg-gradient-to-br from-card/60 to-card/20 p-8 text-center">
              <h3 className="font-display font-bold text-xl md:text-2xl tracking-wide">
                The full track record is public and verifiable.
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl mx-auto">
                Every call is logged the moment the AI makes it. No
                cherry-picking. No retroactive changes.
              </p>
              <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
                <Link
                  href="/briefing"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-sm uppercase tracking-wider transition shadow-[0_0_18px_rgba(59,130,246,0.35)]"
                  data-testid="cta-briefing"
                >
                  View Intelligence Briefing <ArrowRight className="w-4 h-4" />
                </Link>
                {!user && (
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card/60 hover:bg-card text-foreground font-mono text-sm uppercase tracking-wider transition"
                  >
                    Get Access
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-border/60 py-6 text-center text-[11px] font-mono text-muted-foreground">
        ARCLION · v1.0.4-beta · Track record window:{" "}
        {stats ? `${fmtDateLong(stats.trackRecordStart)} → ${fmtDateLong(stats.trackRecordEnd)}` : "—"}
      </footer>
    </div>
  );
}
