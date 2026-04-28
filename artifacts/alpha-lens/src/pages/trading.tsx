import { useState } from "react";
import { Link } from "wouter";
import {
  useGetTradingAccounts,
  useGetPendingOrders,
  useApprovePendingOrder,
  useRejectPendingOrder,
  useGetTradeHistory,
  useGetTradingPositions,
  getGetPendingOrdersQueryKey,
  getGetTradeHistoryQueryKey,
  getGetTradingPositionsQueryKey,
  type PendingOrderItem,
  type LiveTradeItem,
  type PlatformAccountInfo,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Inbox,
  Clock,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn, formatCurrency } from "@/components/ui-helpers";
import { useToast } from "@/hooks/use-toast";

// ----- Helpers -----------------------------------------------------------

type PlatformKey = "kalshi" | "alpaca" | "polymarket" | "paper";

function platformBadgeStyle(platform?: string): string {
  const p = (platform ?? "").toLowerCase();
  if (p === "kalshi")
    return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
  if (p === "alpaca")
    return "bg-green-500/20 text-green-400 border border-green-500/30";
  if (p === "polymarket")
    return "bg-purple-500/20 text-purple-400 border border-purple-500/30";
  return "bg-muted text-muted-foreground border border-border";
}

function PlatformBadge({ platform }: { platform?: string }) {
  const label = (platform ?? "PAPER").toUpperCase();
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded font-mono",
        platformBadgeStyle(platform),
      )}
    >
      {label}
    </span>
  );
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DirectionGlyph({ direction }: { direction?: string }) {
  const d = (direction ?? "").toLowerCase();
  if (d === "bullish" || d === "long" || d === "yes" || d === "buy")
    return <TrendingUp className="w-4 h-4 text-success" />;
  if (d === "bearish" || d === "short" || d === "no" || d === "sell")
    return <TrendingDown className="w-4 h-4 text-destructive" />;
  return <CircleDot className="w-4 h-4 text-muted-foreground" />;
}

// ----- Tab 1: Overview ---------------------------------------------------

function PlatformCard({
  name,
  info,
}: {
  name: string;
  info?: PlatformAccountInfo;
}) {
  const status = info?.status ?? "not_configured";
  const isConfigured = status === "configured" || status === "connected";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 flex flex-col gap-3",
        isConfigured ? "border-success/30" : "border-border",
      )}
      data-testid={`platform-card-${name.toLowerCase()}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("font-semibold text-base", platformBadgeStyle(name).includes("blue") ? "text-blue-400" : platformBadgeStyle(name).includes("green") ? "text-green-400" : platformBadgeStyle(name).includes("purple") ? "text-purple-400" : "text-foreground")}>
            {name}
          </span>
        </div>
        {isConfigured ? (
          <span className="flex items-center gap-1 text-xs font-mono text-success">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Configured
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
            <XCircle className="w-3.5 h-3.5" />
            Not configured
          </span>
        )}
      </div>

      {info?.legalStatus && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-0.5">
            Legal Status
          </div>
          <div className="text-xs text-foreground/80">{info.legalStatus}</div>
        </div>
      )}

      {info?.assetTypes && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-0.5">
            Asset Types
          </div>
          <div className="text-xs text-foreground/80">{info.assetTypes}</div>
        </div>
      )}

      {info?.message && (
        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          {info.message}
        </div>
      )}

      {!isConfigured && (
        <Link
          href="/settings"
          className="mt-auto inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
          data-testid={`link-connect-${name.toLowerCase()}`}
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          Connect in Settings →
        </Link>
      )}
    </div>
  );
}

function OverviewTab() {
  const {
    data: accountsData,
    isLoading: accountsLoading,
    error: accountsError,
  } = useGetTradingAccounts();
  const { data: historyData } = useGetTradeHistory({ limit: 100 });

  const accounts = accountsData?.accounts;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const todayTrades = (historyData?.trades ?? []).filter((t) => {
    if (!t.executedAt) return false;
    return new Date(t.executedAt).getTime() >= todayMs;
  });
  const liveTodayTrades = todayTrades.filter(
    (t) => t.platform && t.platform.toLowerCase() !== "paper",
  );

  const dailyLimit = 5;
  const tradeCount = todayTrades.length;
  const todayPnl = liveTodayTrades.reduce(
    (sum, t) => sum + (Number(t.amountUsd) || 0),
    0,
  );
  // The backend's RISK config currently always requires approval; there is no
  // user-facing toggle endpoint, so we surface the system default truthfully
  // rather than inferring from pending count (which is unrelated).
  const approvalMode = true;

  if (accountsLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground animate-pulse font-mono text-sm">
        Loading platform status…
      </div>
    );
  }

  if (accountsError) {
    return (
      <div
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        data-testid="error-overview"
      >
        <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive">Failed to load platform status.</p>
        <p className="text-xs text-muted-foreground mt-1">
          {(accountsError as Error)?.message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PlatformCard name="Kalshi" info={accounts?.kalshi} />
        <PlatformCard name="Alpaca" info={accounts?.alpaca} />
        <PlatformCard name="Polymarket" info={accounts?.polymarket} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className="rounded-xl border border-border bg-card p-4"
          data-testid="stat-trades-today"
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
            Trades Today
          </div>
          <div className="font-mono text-2xl font-bold">
            {tradeCount}
            <span className="text-sm text-muted-foreground"> / {dailyLimit}</span>
          </div>
        </div>

        <div
          className="rounded-xl border border-border bg-card p-4"
          data-testid="stat-pnl-today"
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
            Live Volume Today
          </div>
          <div className="font-mono text-2xl font-bold">
            {formatCurrency(todayPnl)}
          </div>
        </div>

        <div
          className="rounded-xl border border-border bg-card p-4"
          data-testid="stat-approval-mode"
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
            Approval Mode
          </div>
          <div className="font-mono text-2xl font-bold flex items-center gap-2">
            <span className={cn(approvalMode ? "text-success" : "text-muted-foreground")}>
              {approvalMode ? "ON" : "OFF"}
            </span>
            <span className="text-xs text-muted-foreground font-normal">
              All trades require your approval
            </span>
          </div>
        </div>
      </div>

      {accounts?.usJurisdictionMode && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-warning">
                US Jurisdiction Mode
              </div>
              {accounts.note && (
                <div className="text-xs text-muted-foreground mt-1">
                  {accounts.note}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----- Tab 2: Pending Approval ------------------------------------------

function PendingCard({ order }: { order: PendingOrderItem }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetPendingOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTradeHistoryQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetTradingPositionsQueryKey(),
    });
  };

  const approveMutation = useApprovePendingOrder({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Trade approved and executed",
          description: order.recTitle,
        });
        invalidate();
      },
      onError: (err: unknown) => {
        const msg = (err as Error)?.message ?? "Approval failed";
        setErrorMsg(msg);
        toast({
          title: "Approval failed",
          description: msg,
          variant: "destructive",
        });
      },
    },
  });

  const rejectMutation = useRejectPendingOrder({
    mutation: {
      onSuccess: () => {
        toast({ title: "Trade rejected" });
        invalidate();
      },
      onError: (err: unknown) => {
        const msg = (err as Error)?.message ?? "Reject failed";
        setErrorMsg(msg);
        toast({
          title: "Reject failed",
          description: msg,
          variant: "destructive",
        });
      },
    },
  });

  const isBusy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 space-y-3"
      data-testid={`pending-card-${order.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5">
            <DirectionGlyph direction={order.direction} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <PlatformBadge platform={order.platform} />
              {order.direction && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {order.direction}
                </span>
              )}
              <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo(order.createdAt)}
              </span>
            </div>
            <h3 className="font-semibold text-sm leading-snug truncate">
              {order.recTitle ?? "Untitled trade"}
            </h3>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono font-bold text-base">
            {formatCurrency(order.amountUsd)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {order.aiProbability != null && (
          <div className="bg-secondary/30 rounded p-2">
            <div className="text-[10px] font-mono text-muted-foreground">
              AI PROB
            </div>
            <div className="font-mono font-bold">
              {(Number(order.aiProbability) * 100).toFixed(1)}%
            </div>
          </div>
        )}
        {order.edge != null && (
          <div className="bg-secondary/30 rounded p-2">
            <div className="text-[10px] font-mono text-muted-foreground">
              EDGE
            </div>
            <div
              className={cn(
                "font-mono font-bold",
                Number(order.edge) > 0 ? "text-success" : "text-destructive",
              )}
            >
              {Number(order.edge) > 0 ? "+" : ""}
              {Number(order.edge).toFixed(1)}%
            </div>
          </div>
        )}
        {order.confidence != null && (
          <div className="bg-secondary/30 rounded p-2">
            <div className="text-[10px] font-mono text-muted-foreground">
              CONFIDENCE
            </div>
            <div className="font-mono font-bold">
              {Number(order.confidence)}%
            </div>
          </div>
        )}
      </div>

      {order.platformReason && (
        <div className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
          <span className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground/80">
            Routing:
          </span>{" "}
          {order.platformReason}
        </div>
      )}

      {errorMsg && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
          {errorMsg}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => order.id && approveMutation.mutate({ id: order.id })}
          disabled={isBusy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-success/15 hover:bg-success/25 border border-success/30 text-success text-sm font-medium transition-colors disabled:opacity-50"
          data-testid={`btn-approve-${order.id}`}
        >
          <CheckCircle2 className="w-4 h-4" />
          {approveMutation.isPending ? "Approving…" : "Approve"}
        </button>

        {confirmingReject ? (
          <>
            <button
              onClick={() => order.id && rejectMutation.mutate({ id: order.id })}
              disabled={isBusy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-destructive/20 hover:bg-destructive/30 border border-destructive/40 text-destructive text-sm font-medium transition-colors disabled:opacity-50"
              data-testid={`btn-confirm-reject-${order.id}`}
            >
              {rejectMutation.isPending ? "Rejecting…" : "Confirm reject"}
            </button>
            <button
              onClick={() => setConfirmingReject(false)}
              disabled={isBusy}
              className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/70 text-foreground text-sm font-medium transition-colors disabled:opacity-50"
              data-testid={`btn-cancel-reject-${order.id}`}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmingReject(true)}
            disabled={isBusy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive text-sm font-medium transition-colors disabled:opacity-50"
            data-testid={`btn-reject-${order.id}`}
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        )}
      </div>
    </div>
  );
}

function PendingTab() {
  const { data, isLoading, error } = useGetPendingOrders({
    query: {
      queryKey: getGetPendingOrdersQueryKey(),
      refetchInterval: 30000,
    },
  });
  const orders = data?.pending ?? [];

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground animate-pulse font-mono text-sm">
        Loading pending orders…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        data-testid="error-pending"
      >
        <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive">Failed to load pending orders.</p>
        <p className="text-xs text-muted-foreground mt-1">
          {(error as Error)?.message}
        </p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-12 text-center"
        data-testid="empty-pending"
      >
        <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-base font-semibold mb-1">
          No trades awaiting approval
        </h3>
        <p className="text-sm text-muted-foreground">
          Trades will appear here when you execute from the{" "}
          <Link href="/briefing" className="text-primary hover:underline">
            Briefing page
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <PendingCard key={order.id} order={order} />
      ))}
    </div>
  );
}

// ----- Tab 3: History ---------------------------------------------------

type HistoryFilter = "all" | "kalshi" | "alpaca" | "paper" | "filled" | "rejected";

function HistoryRow({ trade }: { trade: LiveTradeItem }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="border-b border-border/50 hover:bg-secondary/20 cursor-pointer"
        data-testid={`history-row-${trade.id}`}
      >
        <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">
          {formatDateTime(trade.executedAt)}
        </td>
        <td className="px-3 py-2 text-xs">
          <div className="font-medium truncate max-w-[200px]">
            {trade.assetTitle ?? trade.assetId ?? "—"}
          </div>
          {trade.ticker && (
            <div className="text-[10px] font-mono text-muted-foreground">
              {trade.ticker}
            </div>
          )}
        </td>
        <td className="px-3 py-2">
          <PlatformBadge platform={trade.platform} />
        </td>
        <td className="px-3 py-2 text-xs">
          <div className="flex items-center gap-1">
            <DirectionGlyph direction={trade.direction} />
            <span className="font-mono uppercase">{trade.direction ?? "—"}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-xs font-mono font-bold">
          {formatCurrency(trade.amountUsd)}
        </td>
        <td className="px-3 py-2 text-xs font-mono">
          {trade.aiProbability != null
            ? `${(Number(trade.aiProbability) * 100).toFixed(0)}%`
            : "—"}
        </td>
        <td className="px-3 py-2 text-xs font-mono">
          {trade.aiEdge != null ? (
            <span
              className={cn(
                Number(trade.aiEdge) > 0 ? "text-success" : "text-destructive",
              )}
            >
              {Number(trade.aiEdge) > 0 ? "+" : ""}
              {Number(trade.aiEdge).toFixed(1)}%
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="px-3 py-2">
          <span
            className={cn(
              "px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded font-mono border",
              trade.status === "filled"
                ? "bg-success/15 text-success border-success/30"
                : trade.status === "rejected"
                  ? "bg-destructive/15 text-destructive border-destructive/30"
                  : "bg-muted text-muted-foreground border-border",
            )}
          >
            {trade.status ?? "—"}
          </span>
        </td>
        <td className="px-3 py-2 text-muted-foreground">
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/50 bg-secondary/10">
          <td colSpan={9} className="px-3 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {trade.orderId && (
                <div>
                  <span className="text-muted-foreground font-mono">Order ID:</span>{" "}
                  <span className="font-mono">{trade.orderId}</span>
                </div>
              )}
              {trade.price != null && (
                <div>
                  <span className="text-muted-foreground font-mono">
                    Execution Price:
                  </span>{" "}
                  <span className="font-mono">{formatCurrency(trade.price, 4)}</span>
                </div>
              )}
              {trade.size != null && (
                <div>
                  <span className="text-muted-foreground font-mono">Size:</span>{" "}
                  <span className="font-mono">{Number(trade.size).toFixed(4)}</span>
                </div>
              )}
              {trade.confidence != null && (
                <div>
                  <span className="text-muted-foreground font-mono">
                    Confidence:
                  </span>{" "}
                  <span className="font-mono">{Number(trade.confidence)}%</span>
                </div>
              )}
              {trade.paperMode && (
                <div className="text-muted-foreground">
                  This was a paper trade (no real funds at risk).
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function HistoryTab() {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const { data, isLoading, error } = useGetTradeHistory({ limit: 50 });
  const trades = data?.trades ?? [];

  const filtered = trades.filter((t) => {
    if (filter === "all") return true;
    if (filter === "filled" || filter === "rejected") return t.status === filter;
    return (t.platform ?? "").toLowerCase() === filter;
  });

  const filters: HistoryFilter[] = [
    "all",
    "kalshi",
    "alpaca",
    "paper",
    "filled",
    "rejected",
  ];

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground animate-pulse font-mono text-sm">
        Loading trade history…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        data-testid="error-history"
      >
        <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive">Failed to load trade history.</p>
        <p className="text-xs text-muted-foreground mt-1">
          {(error as Error)?.message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            data-testid={`filter-${f}`}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider border transition-colors",
              filter === f
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div
          className="rounded-xl border border-border bg-card p-12 text-center"
          data-testid="empty-history"
        >
          <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {trades.length === 0
              ? "No live trades yet. Execute a trade from the Intelligence Briefing to get started."
              : "No trades match the selected filter."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-secondary/30">
              <tr>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Date
                </th>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Asset
                </th>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Platform
                </th>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Direction
                </th>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Amount
                </th>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  AI Prob
                </th>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Edge
                </th>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((trade) => (
                <HistoryRow key={trade.id} trade={trade} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ----- Tab 4: Positions -------------------------------------------------

function PositionCard({ position }: { position: LiveTradeItem }) {
  const entry = Number(position.price ?? 0);
  const size = Number(position.size ?? 0);
  // Without a live price feed for arbitrary platform symbols, surface the
  // notional only. Unrealized P&L will populate once platform price polling
  // lands; for now we display the entry exposure honestly.
  const notional = entry > 0 && size > 0 ? entry * size : Number(position.amountUsd ?? 0);

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 space-y-3"
      data-testid={`position-card-${position.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <DirectionGlyph direction={position.direction} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <PlatformBadge platform={position.platform} />
              {position.direction && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {position.direction}
                </span>
              )}
              {position.ticker && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {position.ticker}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-sm leading-snug">
              {position.assetTitle ?? position.assetId ?? "—"}
            </h3>
          </div>
        </div>
        <div className="text-right shrink-0 text-xs text-muted-foreground font-mono flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {timeAgo(position.executedAt)}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-secondary/30 rounded p-2">
          <div className="text-[10px] font-mono text-muted-foreground">
            ENTRY PRICE
          </div>
          <div className="font-mono font-bold">
            {entry > 0 ? formatCurrency(entry, 4) : "—"}
          </div>
        </div>
        <div className="bg-secondary/30 rounded p-2">
          <div className="text-[10px] font-mono text-muted-foreground">SIZE</div>
          <div className="font-mono font-bold">
            {size > 0 ? size.toFixed(4) : "—"}
          </div>
        </div>
        <div className="bg-secondary/30 rounded p-2">
          <div className="text-[10px] font-mono text-muted-foreground">
            NOTIONAL
          </div>
          <div className="font-mono font-bold">{formatCurrency(notional)}</div>
        </div>
        <div className="bg-secondary/30 rounded p-2">
          <div className="text-[10px] font-mono text-muted-foreground">
            UNREALIZED P&L
          </div>
          <div className="font-mono font-bold text-muted-foreground">
            Live pricing pending
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionsTab() {
  const { data, isLoading, error } = useGetTradingPositions({
    query: {
      queryKey: getGetTradingPositionsQueryKey(),
      refetchInterval: 60000,
    },
  });
  const positions = data?.positions ?? [];

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground animate-pulse font-mono text-sm">
        Loading positions…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        data-testid="error-positions"
      >
        <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive">Failed to load positions.</p>
        <p className="text-xs text-muted-foreground mt-1">
          {(error as Error)?.message}
        </p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-12 text-center"
        data-testid="empty-positions"
      >
        <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No open positions</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {positions.map((p) => (
        <PositionCard key={p.id} position={p} />
      ))}
    </div>
  );
}

// ----- Page Shell -------------------------------------------------------

export default function TradingPage() {
  const { data: pendingData } = useGetPendingOrders({
    query: {
      queryKey: getGetPendingOrdersQueryKey(),
      refetchInterval: 30000,
    },
  });
  const pendingCount = pendingData?.pending?.length ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-display text-glow-primary">Live Trading</h1>
        <p className="text-muted-foreground mt-1">
          Route AI recommendations to real platforms with built-in risk gates.
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
          <TabsTrigger value="overview" data-testid="tab-overview" className="py-2">
            Overview
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending" className="py-2">
            <span className="flex items-center gap-1.5">
              Pending
              {pendingCount > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold font-mono"
                  data-testid="tab-pending-badge"
                >
                  {pendingCount}
                </span>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history" className="py-2">
            History
          </TabsTrigger>
          <TabsTrigger
            value="positions"
            data-testid="tab-positions"
            className="py-2"
          >
            Positions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="pending" className="mt-6">
          <PendingTab />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="positions" className="mt-6">
          <PositionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
