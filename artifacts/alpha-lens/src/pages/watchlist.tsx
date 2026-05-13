import { Link } from "wouter";
import {
  useGetWatchlist,
  useRemoveFromWatchlist,
  getGetWatchlistQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Trash2, MessageSquare, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { setAskCoachPrefill } from "@/lib/ask-coach";

export default function WatchlistPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: watchlistData,
    isLoading,
    error,
  } = useGetWatchlist({
    query: { queryKey: getGetWatchlistQueryKey(), refetchInterval: 60000 },
  });

  const removeWatchlistMutation = useRemoveFromWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({
          title: "Removed",
          description: "Asset removed from watchlist.",
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Could not remove from watchlist.",
          variant: "destructive",
        });
      },
    },
  });

  const watchlist = watchlistData?.watchlist ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20">
          <Eye className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Watchlist
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            ASSETS YOU&apos;RE TRACKING ·{" "}
            {isLoading ? "LOADING…" : `${watchlist.length} ITEM${watchlist.length === 1 ? "" : "S"}`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground text-sm">
          Loading watchlist…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            Failed to load watchlist.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {(error as Error).message}
          </p>
        </div>
      ) : watchlist.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Eye className="w-10 h-10 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-base font-semibold mb-2">
            Your watchlist is empty
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Add assets from the Scanner or Briefing to track them here. You&apos;ll
            see them in one place and can quickly ask AI Coach about any of them.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Search className="w-4 h-4" /> Browse Scanner
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          {watchlist.map((item) => (
            <div
              key={item.id}
              className="p-4 hover:bg-secondary/20 transition-colors"
              data-testid={`watchlist-item-${item.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.assetId != null ? (
                      <Link
                        href={`/market/${item.assetId}`}
                        className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                      >
                        {item.assetTitle}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-foreground">
                        {item.assetTitle}
                      </span>
                    )}
                    {item.assetClass && (
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary border border-border">
                        {item.assetClass}
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {item.notes}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {item.alertEdgeThreshold != null && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Alert when edge ≥ {item.alertEdgeThreshold}%
                      </span>
                    )}
                    {item.addedAt && (
                      <span className="text-[10px] font-mono text-muted-foreground/70">
                        Added {new Date(item.addedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href="/coach"
                    onClick={() => {
                      setAskCoachPrefill(
                        `Tell me about ${item.assetTitle} from my watchlist. What's the current setup and any concerns?`,
                        item.assetId ?? undefined,
                      );
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                    title="Ask AI Coach about this asset"
                    data-testid={`btn-ask-coach-watchlist-${item.id}`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Ask Coach
                  </Link>
                  <button
                    onClick={() =>
                      removeWatchlistMutation.mutate({ id: item.id })
                    }
                    disabled={removeWatchlistMutation.isPending}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    title="Remove from watchlist"
                    data-testid={`btn-remove-watchlist-${item.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
