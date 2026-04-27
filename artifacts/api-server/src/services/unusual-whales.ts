import { createHash } from "crypto";

const UW_BASE = "https://api.unusualwhales.com/api";
const UW_CACHE_TTL = 60_000;

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < UW_CACHE_TTL) return entry.data as T;
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

function md5Short(input: string): string {
  return createHash("md5").update(input).digest("hex").slice(0, 16);
}

async function uwFetch<T>(path: string): Promise<T> {
  const key = process.env.UNUSUAL_WHALES_KEY;
  if (!key) throw new Error("UNUSUAL_WHALES_KEY not configured");

  const cached = getCached<T>(path);
  if (cached) return cached;

  const res = await fetch(`${UW_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`UW API ${res.status}: ${text.substring(0, 200)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const data = ((json as any).data ?? json) as T;
  setCache(path, data);
  return data;
}

export interface FlowAlert {
  id: string;
  ticker: string;
  strike: string;
  expiry: string;
  type: string;
  total_premium: string;
  volume: number;
  open_interest: number;
  underlying_price: string;
  alert_rule: string;
  has_sweep: boolean;
  has_floor: boolean;
  total_size: number;
  trade_count: number;
  created_at: string;
  iv_start: string;
  volume_oi_ratio: string;
  total_ask_side_prem: string;
  total_bid_side_prem: string;
  sector: string | null;
  issue_type?: string | null;
  er_time?: string | null;
  marketcap?: string | null;
  next_earnings_date?: string | null;
}

export interface DarkPoolPrint {
  ticker: string;
  size: number;
  price: string;
  volume: number;
  premium: string;
  executed_at: string;
  nbbo_ask: string;
  nbbo_bid: string;
  market_center: string;
  sale_cond_codes?: string | string[] | null;
  trade_code?: string | null;
}

export interface MarketTideTick {
  timestamp: string;
  date: string;
  net_call_premium: string;
  net_put_premium: string;
  net_volume: number;
}

export interface CongressTrade {
  name: string;
  ticker: string | null;
  issuer: string;
  is_active: boolean;
  transaction_date: string;
  politician_id: string;
  reporter: string;
  txn_type: string;
  amounts: string;
  notes: string;
  filed_at_date: string;
  member_type: string;
}

export interface CryptoWhale {
  pair: string;
  amount: number;
  usd_value: number;
  from_address: string;
  to_address: string;
  chain: string;
  timestamp: string;
  transaction_hash: string;
}

export interface RadarAlertCompat {
  id: string;
  type: string;
  severity: string;
  assetId: string;
  assetLabel: string;
  title: string;
  pctChange?: number;
  direction?: string;
  priceStart?: number;
  priceNow?: number;
  windowMinutes?: number;
  thresholdPct?: number;
  volumeMultiplier?: number;
  volumeType?: string;
  confidence?: number;
  reason?: string;
  triggerAsset?: string;
  triggerPct?: number;
  chainAssets: string[];
  historicalNote?: string;
  aiScanning?: string;
  note?: string;
  dataSource?: string;
  createdAt: string;
}

export function isConfigured(): boolean {
  return !!process.env.UNUSUAL_WHALES_KEY;
}

function normalizeFlowAlert(raw: any): FlowAlert {
  return {
    ...raw,
    sector: raw.sector ?? raw.underlying_sector ?? null,
    issue_type: raw.issue_type ?? raw.type_of_underlying ?? null,
    er_time: raw.er_time ?? raw.earnings_time ?? null,
    marketcap: raw.marketcap ?? raw.market_cap ?? null,
    next_earnings_date: raw.next_earnings_date ?? raw.earnings_date ?? null,
  };
}

function normalizeDarkPoolPrint(raw: any): DarkPoolPrint {
  return {
    ...raw,
    sale_cond_codes: raw.sale_cond_codes ?? raw.conditions ?? null,
    trade_code: raw.trade_code ?? raw.trade_type ?? null,
  };
}

export async function getFlowAlerts(): Promise<FlowAlert[]> {
  const alerts = await uwFetch<FlowAlert[]>("/option-trades/flow-alerts");
  return Array.isArray(alerts) ? alerts.slice(0, 50).map(normalizeFlowAlert) : [];
}

export async function getDarkPoolRecent(): Promise<DarkPoolPrint[]> {
  const prints = await uwFetch<DarkPoolPrint[]>("/darkpool/recent");
  return Array.isArray(prints) ? prints.slice(0, 50).map(normalizeDarkPoolPrint) : [];
}

export async function getDarkPoolTicker(ticker: string): Promise<DarkPoolPrint[]> {
  const prints = await uwFetch<DarkPoolPrint[]>(`/darkpool/${encodeURIComponent(ticker.toUpperCase())}`);
  return Array.isArray(prints) ? prints.slice(0, 50).map(normalizeDarkPoolPrint) : [];
}

export async function getMarketTide(): Promise<MarketTideTick[]> {
  return uwFetch<MarketTideTick[]>("/market/market-tide");
}

export async function getCongressTrades(): Promise<CongressTrade[]> {
  const trades = await uwFetch<CongressTrade[]>("/congress/recent-trades");
  return Array.isArray(trades) ? trades.slice(0, 50) : [];
}

export async function getCryptoWhales(): Promise<CryptoWhale[]> {
  const txns = await uwFetch<CryptoWhale[]>("/crypto/whales/recent");
  return Array.isArray(txns) ? txns.slice(0, 50) : [];
}

export async function fetchOptionsFlowAlerts(): Promise<RadarAlertCompat[]> {
  if (!process.env.UNUSUAL_WHALES_KEY) {
    console.warn("UNUSUAL_WHALES_KEY not set — skipping options flow");
    return [];
  }
  try {
    const alerts = await getFlowAlerts();
    return alerts
      .filter((a) => (parseFloat(a.total_premium) || 0) >= 500_000)
      .map((a) => {
        const premium = parseFloat(a.total_premium) || 0;
        const premStr = `$${(premium / 1_000_000).toFixed(1)}M`;
        const extras: string[] = [];
        if (a.sector) extras.push(`sector ${a.sector}`);
        if (a.issue_type) extras.push(`issue ${a.issue_type}`);
        if (a.marketcap) extras.push(`mcap ${a.marketcap}`);
        if (a.next_earnings_date) {
          extras.push(`next ER ${a.next_earnings_date}${a.er_time ? ` (${a.er_time})` : ""}`);
        }
        const extrasStr = extras.length > 0 ? ` ${extras.join(", ")}.` : "";
        return {
          id: md5Short(`uw_flow_${a.id || a.ticker + a.strike + a.expiry}`),
          type: "volume_anomaly",
          severity: premium >= 1_000_000 ? "high" : "medium",
          assetId: a.ticker.toLowerCase(),
          assetLabel: a.ticker.toUpperCase(),
          title: `Unusual options flow: ${premStr} in ${a.ticker} ${a.strike} ${a.type}`,
          direction: a.type === "call" ? "bull" : "bear",
          volumeType: "options_flow",
          note: `${a.ticker} ${a.strike} ${a.type} expiring ${a.expiry} — ${premStr} premium, ${a.volume} contracts, ${a.has_sweep ? "SWEEP" : "block"}. Vol/OI ratio: ${a.volume_oi_ratio}.${extrasStr}`,
          dataSource: "Unusual Whales",
          chainAssets: [],
          createdAt: a.created_at || new Date().toISOString(),
        };
      });
  } catch (e: any) {
    if (e.message?.includes("429")) {
      console.warn("Unusual Whales rate limited on options flow");
    } else {
      console.error("UW options flow error:", e.message);
    }
    return [];
  }
}

export async function fetchDarkPoolAlerts(): Promise<RadarAlertCompat[]> {
  if (!process.env.UNUSUAL_WHALES_KEY) {
    console.warn("UNUSUAL_WHALES_KEY not set — skipping dark pool");
    return [];
  }
  try {
    const prints = await getDarkPoolRecent();
    return prints
      .filter((p) => {
        const notional = p.size * (parseFloat(p.price) || 0);
        return notional >= 1_000_000;
      })
      .map((p) => {
        const price = parseFloat(p.price) || 0;
        const notional = p.size * price;
        const notionalStr = notional >= 1_000_000
          ? `$${(notional / 1_000_000).toFixed(1)}M`
          : `$${(notional / 1_000).toFixed(0)}K`;
        const condCodes = Array.isArray(p.sale_cond_codes)
          ? p.sale_cond_codes.join(",")
          : (p.sale_cond_codes ?? null);
        const extras: string[] = [];
        if (condCodes) extras.push(`cond ${condCodes}`);
        if (p.trade_code) extras.push(`code ${p.trade_code}`);
        const extrasStr = extras.length > 0 ? ` ${extras.join(", ")}.` : "";
        return {
          id: md5Short(`uw_dp_${p.ticker}${p.executed_at}${p.size}`),
          type: "volume_anomaly",
          severity: "medium",
          assetId: p.ticker.toLowerCase(),
          assetLabel: p.ticker.toUpperCase(),
          title: `Dark pool block trade: ${p.size.toLocaleString()} shares of ${p.ticker} off-exchange`,
          volumeType: "dark_pool",
          note: `${p.ticker} dark pool print: ${p.size.toLocaleString()} shares at $${price.toFixed(2)} (${notionalStr} notional). NBBO: $${p.nbbo_bid}–$${p.nbbo_ask}. Venue: ${p.market_center}.${extrasStr}`,
          dataSource: "Unusual Whales Dark Pool",
          chainAssets: [],
          createdAt: p.executed_at || new Date().toISOString(),
        };
      });
  } catch (e: any) {
    if (e.message?.includes("429")) {
      console.warn("Unusual Whales rate limited on dark pool");
    } else {
      console.error("UW dark pool error:", e.message);
    }
    return [];
  }
}

export async function fetchCongressionalTrades(): Promise<RadarAlertCompat[]> {
  if (!process.env.UNUSUAL_WHALES_KEY) {
    console.warn("UNUSUAL_WHALES_KEY not set — skipping congress trades");
    return [];
  }
  try {
    const trades = await getCongressTrades();
    return trades
      .filter((t) => t.ticker)
      .map((t) => {
        const isBuy = (t.txn_type || "").toLowerCase().includes("buy") || (t.txn_type || "").toLowerCase().includes("purchase");
        return {
          id: md5Short(`uw_congress_${t.reporter}${t.ticker}${t.filed_at_date}`),
          type: "news_catalyst",
          severity: "medium",
          assetId: (t.ticker || "unknown").toLowerCase(),
          assetLabel: (t.ticker || "UNKNOWN").toUpperCase(),
          title: `Congressional trade: ${t.reporter} ${t.txn_type} ${t.ticker}`,
          direction: isBuy ? "bull" : "bear",
          note: `${t.reporter} (${t.member_type}) — ${t.txn_type} ${t.ticker}. ${t.notes ? t.notes.slice(0, 120) : ""}. Amount: ${t.amounts}. Filed: ${t.filed_at_date}. Traded: ${t.transaction_date}.`,
          dataSource: "Unusual Whales Congress",
          chainAssets: [],
          createdAt: t.filed_at_date || new Date().toISOString(),
        };
      });
  } catch (e: any) {
    if (e.message?.includes("429")) {
      console.warn("Unusual Whales rate limited on congress trades");
    } else {
      console.error("UW congress error:", e.message);
    }
    return [];
  }
}

export async function fetchCryptoWhaleAlerts(): Promise<RadarAlertCompat[]> {
  if (!process.env.UNUSUAL_WHALES_KEY) {
    console.warn("UNUSUAL_WHALES_KEY not set — skipping crypto whales");
    return [];
  }
  try {
    const txns = await getCryptoWhales();
    return txns
      .filter((w) => (w.usd_value || 0) >= 1_000_000)
      .map((w) => {
        const amtStr = w.usd_value >= 10_000_000
          ? `$${(w.usd_value / 1_000_000).toFixed(1)}M`
          : `$${(w.usd_value / 1_000_000).toFixed(2)}M`;
        const fromAddr = (w.from_address || "").slice(0, 10) + "…";
        const toAddr = (w.to_address || "").slice(0, 10) + "…";
        return {
          id: md5Short(`uw_whale_${w.transaction_hash || w.pair + w.timestamp}`),
          type: "volume_anomaly",
          severity: w.usd_value >= 10_000_000 ? "high" : "medium",
          assetId: "crypto_" + (w.pair || "unknown").toLowerCase(),
          assetLabel: (w.pair || "UNKNOWN").toUpperCase(),
          title: `Crypto whale: ${amtStr} ${w.pair} on-chain transaction`,
          volumeType: "crypto_whale",
          note: `${w.pair} on-chain transfer: ${amtStr} from ${fromAddr} to ${toAddr}. Chain: ${w.chain}. ${w.amount} units.`,
          dataSource: "Unusual Whales Crypto",
          chainAssets: [],
          createdAt: w.timestamp || new Date().toISOString(),
        };
      });
  } catch (e: any) {
    if (e.message?.includes("429")) {
      console.warn("Unusual Whales rate limited on crypto whales");
    } else {
      console.error("UW crypto whales error:", e.message);
    }
    return [];
  }
}

export async function getFlowSummary(): Promise<{
  totalAlerts: number;
  totalPremium: number;
  callPremium: number;
  putPremium: number;
  topTickers: { ticker: string; premium: number; count: number }[];
  sweepCount: number;
  biggestTrade: FlowAlert | null;
}> {
  const alerts = await getFlowAlerts();

  let totalPremium = 0;
  let callPremium = 0;
  let putPremium = 0;
  let sweepCount = 0;
  let biggestTrade: FlowAlert | null = null;
  let biggestPrem = 0;
  const tickerMap = new Map<string, { premium: number; count: number }>();

  for (const a of alerts) {
    const prem = parseFloat(a.total_premium) || 0;
    totalPremium += prem;
    if (a.type === "call") callPremium += prem;
    else putPremium += prem;
    if (a.has_sweep) sweepCount++;
    if (prem > biggestPrem) { biggestPrem = prem; biggestTrade = a; }

    const existing = tickerMap.get(a.ticker) || { premium: 0, count: 0 };
    existing.premium += prem;
    existing.count++;
    tickerMap.set(a.ticker, existing);
  }

  const topTickers = [...tickerMap.entries()]
    .map(([ticker, v]) => ({ ticker, ...v }))
    .sort((a, b) => b.premium - a.premium)
    .slice(0, 10);

  return {
    totalAlerts: alerts.length,
    totalPremium,
    callPremium,
    putPremium,
    topTickers,
    sweepCount,
    biggestTrade,
  };
}
