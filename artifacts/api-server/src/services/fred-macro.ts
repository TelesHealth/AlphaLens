import { logger } from "../lib/logger";

const FRED_BASE = "https://api.stlouisfed.org/fred";
const TIMEOUT_MS = 10_000;

export interface MacroPoint {
  current: number;
  previous: number;
  change: number;
  date: string;
}

export interface YieldCurvePoint {
  spread: number;
  inverted: boolean;
  date: string;
}

export interface MacroSnapshot {
  fedFundsRate: MacroPoint | null;
  cpi: MacroPoint | null;
  unemployment: MacroPoint | null;
  gdp: MacroPoint | null;
  yieldCurve: YieldCurvePoint | null;
  summary: string;
  source: string;
  updatedAt: string;
}

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function isConfigured(): boolean {
  return Boolean(process.env.FRED_API_KEY);
}

function buildUrl(seriesId: string, limit: number): string {
  const key = process.env.FRED_API_KEY ?? "";
  return `${FRED_BASE}/series/observations?series_id=${seriesId}&limit=${limit}&sort_order=desc&api_key=${key}&file_type=json`;
}

function parseObservations(data: FredResponse): { value: number; date: string }[] {
  const obs = data.observations ?? [];
  return obs
    .map((o) => ({ value: Number(o.value), date: o.date }))
    .filter((o) => Number.isFinite(o.value));
}

async function fetchSeriesPair(seriesId: string): Promise<MacroPoint | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetchWithTimeout(buildUrl(seriesId, 2));
    if (!res.ok) return null;
    const data = (await res.json()) as FredResponse;
    const points = parseObservations(data);
    if (points.length === 0) return null;
    const current = points[0].value;
    const previous = points[1]?.value ?? current;
    return {
      current: Math.round(current * 100) / 100,
      previous: Math.round(previous * 100) / 100,
      change: Math.round((current - previous) * 100) / 100,
      date: points[0].date,
    };
  } catch (e: any) {
    logger.warn({ err: e.message, series: seriesId }, "FRED series fetch failed");
    return null;
  }
}

export async function fetchFedFundsRate(): Promise<MacroPoint | null> {
  return fetchSeriesPair("FEDFUNDS");
}

export async function fetchCPI(): Promise<MacroPoint | null> {
  return fetchSeriesPair("CPIAUCSL");
}

export async function fetchUnemploymentRate(): Promise<MacroPoint | null> {
  return fetchSeriesPair("UNRATE");
}

export async function fetchGDPGrowth(): Promise<MacroPoint | null> {
  return fetchSeriesPair("GDP");
}

export async function fetchYieldCurve(): Promise<YieldCurvePoint | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetchWithTimeout(buildUrl("T10Y2Y", 1));
    if (!res.ok) return null;
    const data = (await res.json()) as FredResponse;
    const points = parseObservations(data);
    if (points.length === 0) return null;
    const spread = Math.round(points[0].value * 100) / 100;
    return {
      spread,
      inverted: spread < 0,
      date: points[0].date,
    };
  } catch (e: any) {
    logger.warn({ err: e.message }, "FRED yield curve fetch failed");
    return null;
  }
}

function fmtSign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function fmtPoint(label: string, point: MacroPoint | null, unit = "%"): string {
  if (!point) return `${label}: unavailable`;
  return `${label}: ${point.current}${unit} (prev: ${point.previous}${unit}, change: ${fmtSign(point.change)}${unit})`;
}

function fmtGdp(point: MacroPoint | null): string {
  if (!point) return "GDP: unavailable";
  const cur = (point.current / 1000).toFixed(2);
  const prev = (point.previous / 1000).toFixed(2);
  return `GDP: $${cur} trillion (prev: $${prev} trillion)`;
}

function fmtYieldCurve(yc: YieldCurvePoint | null): string {
  if (!yc) return "Yield Curve (10Y-2Y): unavailable";
  const tag = yc.inverted ? "INVERTED - recession signal" : "NORMAL";
  return `Yield Curve (10Y-2Y): ${yc.spread}% [${tag}]`;
}

export async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  const updatedAt = new Date().toISOString();

  if (!isConfigured()) {
    return {
      fedFundsRate: null,
      cpi: null,
      unemployment: null,
      gdp: null,
      yieldCurve: null,
      summary: "FRED macro data unavailable — add FRED_API_KEY to Secrets",
      source: "Federal Reserve Economic Data (FRED)",
      updatedAt,
    };
  }

  const [fedRes, cpiRes, unempRes, gdpRes, ycRes] = await Promise.allSettled([
    fetchFedFundsRate(),
    fetchCPI(),
    fetchUnemploymentRate(),
    fetchGDPGrowth(),
    fetchYieldCurve(),
  ]);

  const fed = fedRes.status === "fulfilled" ? fedRes.value : null;
  const cpi = cpiRes.status === "fulfilled" ? cpiRes.value : null;
  const unemp = unempRes.status === "fulfilled" ? unempRes.value : null;
  const gdp = gdpRes.status === "fulfilled" ? gdpRes.value : null;
  const yc = ycRes.status === "fulfilled" ? ycRes.value : null;

  const summary = [
    "MACRO CONTEXT (FRED):",
    fmtPoint("Fed Funds Rate", fed),
    fmtPoint("CPI Inflation", cpi),
    fmtPoint("Unemployment", unemp),
    fmtGdp(gdp),
    fmtYieldCurve(yc),
    "Data from Federal Reserve Economic Data (FRED)",
  ].join("\n");

  return {
    fedFundsRate: fed,
    cpi,
    unemployment: unemp,
    gdp,
    yieldCurve: yc,
    summary,
    source: "Federal Reserve Economic Data (FRED)",
    updatedAt,
  };
}

export async function fetchMacroContext(): Promise<string> {
  try {
    const snap = await fetchMacroSnapshot();
    return snap.summary;
  } catch (e: any) {
    logger.warn({ err: e.message }, "FRED macro context fetch failed");
    return "FRED macro data unavailable — add FRED_API_KEY to Secrets";
  }
}
