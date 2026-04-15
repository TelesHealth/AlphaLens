import { ReactNode } from "react";
import { MarketSector, MarketDirection, MarketRiskLevel, SignalImpact } from "@workspace/api-client-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined, precision = 2) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function SectorBadge({ sector }: { sector: MarketSector }) {
  const colors: Record<MarketSector, string> = {
    crypto: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    equities: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    energy: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    metals: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    agriculture: "bg-green-500/10 text-green-400 border-green-500/20",
    fx: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    real_estate: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    prediction: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  };

  return (
    <span className={cn("px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded-md border", colors[sector] || colors.equities)}>
      {sector}
    </span>
  );
}

export function DirectionBadge({ direction }: { direction: MarketDirection }) {
  if (!direction) return <span className="text-muted-foreground">—</span>;
  
  const styles = {
    bullish: "bg-success/10 text-success border-success/20 shadow-[0_0_10px_rgba(34,197,94,0.15)]",
    bearish: "bg-destructive/10 text-destructive border-destructive/20 shadow-[0_0_10px_rgba(239,68,68,0.15)]",
    neutral: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span className={cn("px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded-md border inline-flex items-center gap-1.5", styles[direction])}>
      {direction === 'bullish' && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
      {direction === 'bearish' && <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />}
      {direction}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: MarketRiskLevel }) {
  if (!risk) return null;
  
  const styles = {
    low: "text-success border-success/30",
    medium: "text-warning border-warning/30",
    high: "text-orange-500 border-orange-500/30",
    extreme: "text-destructive border-destructive/30",
  };

  return (
    <span className={cn("px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded border bg-card", styles[risk])}>
      Risk: {risk}
    </span>
  );
}

export function ImpactBadge({ impact }: { impact: SignalImpact }) {
  const styles = {
    high: "bg-primary/20 text-primary border-primary/30",
    medium: "bg-secondary text-foreground border-border",
    low: "bg-transparent text-muted-foreground border-border",
  };

  return (
    <span className={cn("px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded border", styles[impact])}>
      {impact} Impact
    </span>
  );
}

export function ScoreDisplay({ score, size = "md" }: { score: number | null | undefined, size?: "sm" | "md" | "lg" | "xl" }) {
  if (score === null || score === undefined) return <span className="text-muted-foreground font-mono">—</span>;
  
  let color = "text-warning";
  if (score >= 65) color = "text-success text-glow-success";
  if (score <= 35) color = "text-destructive text-glow-destructive";

  const sizeClasses = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-5xl font-display tracking-tight"
  };

  return (
    <div className="flex items-baseline gap-1">
      <span className={cn("font-bold font-mono", color, sizeClasses[size])}>{score.toFixed(0)}</span>
      {size !== "sm" && size !== "md" && <span className="text-sm font-mono text-muted-foreground">/100</span>}
    </div>
  );
}
