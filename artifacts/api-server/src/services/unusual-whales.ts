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

  const json = await res.json();
  const data = (json.data ?? json) as T;
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
}

export interface MarketTideTick {
  timestamp: string;
  date: string;
  net_call_premium: string;
  net_put_premium: string;
  net_volume: number;
}

export function isConfigured(): boolean {
  return !!process.env.UNUSUAL_WHALES_KEY;
}

export async function getFlowAlerts(): Promise<FlowAlert[]> {
  const alerts = await uwFetch<FlowAlert[]>("/option-trades/flow-alerts");
  return alerts.slice(0, 50);
}

export async function getDarkPoolRecent(): Promise<DarkPoolPrint[]> {
  const prints = await uwFetch<DarkPoolPrint[]>("/darkpool/recent");
  return prints.slice(0, 50);
}

export async function getDarkPoolTicker(ticker: string): Promise<DarkPoolPrint[]> {
  const prints = await uwFetch<DarkPoolPrint[]>(`/darkpool/${encodeURIComponent(ticker.toUpperCase())}`);
  return prints.slice(0, 50);
}

export async function getMarketTide(): Promise<MarketTideTick[]> {
  return uwFetch<MarketTideTick[]>("/market/market-tide");
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
