import { logger } from "../lib/logger";

const NY_FED_EFFR = "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json";
const BLS_ENDPOINT = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

const SERIES_CPI = "CUUR0000SA0";
const SERIES_UNEMPLOYMENT = "LNS14000000";

export interface FedFundsRate {
  effective: number;
  targetUpper: number;
  targetLower: number;
  asOf: string;
}

export interface BlsObservation {
  value: number;
  period: string;
  year: string;
  date: string;
}

export interface BlsSeries {
  current: BlsObservation;
  previous: BlsObservation | null;
  change: number | null;
  changePct: number | null;
}

export interface BlsMacro {
  cpi: BlsSeries | null;
  unemployment: BlsSeries | null;
  asOf: string;
}

interface FedCacheEntry { value: FedFundsRate | null; ts: number; }
interface BlsCacheEntry { value: BlsMacro | null; ts: number; }

const CACHE_TTL_OK_MS = 6 * 60 * 60 * 1000;
const CACHE_TTL_FAIL_MS = 2 * 60 * 1000;
const BLS_CACHE_TTL_OK_MS = 24 * 60 * 60 * 1000;
const BLS_CACHE_TTL_FAIL_MS = 5 * 60 * 1000;

let fedCache: FedCacheEntry | null = null;
let blsCache: BlsCacheEntry | null = null;

interface NyFedResponse {
  refRates?: Array<{
    effectiveDate?: string;
    percentRate?: number;
    targetRateFrom?: number;
    targetRateTo?: number;
  }>;
}

interface BlsRawDatum {
  year: string;
  period: string;
  periodName?: string;
  value: string;
}

interface BlsResponse {
  status?: string;
  message?: string[];
  Results?: {
    series?: Array<{
      seriesID: string;
      data?: BlsRawDatum[];
    }>;
  };
}

export async function getFedFundsRate(): Promise<FedFundsRate | null> {
  if (fedCache) {
    const ttl = fedCache.value ? CACHE_TTL_OK_MS : CACHE_TTL_FAIL_MS;
    if (Date.now() - fedCache.ts < ttl) return fedCache.value;
  }
  try {
    const res = await fetch(NY_FED_EFFR, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`NY Fed HTTP ${res.status}`);
    const json = (await res.json()) as NyFedResponse;
    const row = json.refRates?.[0];
    if (!row || row.percentRate == null) throw new Error("NY Fed: no rate data");
    const value: FedFundsRate = {
      effective: row.percentRate,
      targetUpper: row.targetRateTo ?? row.percentRate,
      targetLower: row.targetRateFrom ?? row.percentRate,
      asOf: row.effectiveDate ?? "",
    };
    fedCache = { value, ts: Date.now() };
    return value;
  } catch (e: any) {
    logger.warn(`macro-data: getFedFundsRate failed — ${e?.message ?? e}`);
    fedCache = { value: null, ts: Date.now() };
    return null;
  }
}

function parseSeries(data: BlsRawDatum[] | undefined): BlsSeries | null {
  if (!data || data.length === 0) return null;
  const sorted = [...data].sort((a, b) => {
    if (a.year !== b.year) return b.year.localeCompare(a.year);
    return b.period.localeCompare(a.period);
  });
  const cur = sorted[0];
  const prev = sorted[1] ?? null;
  const curVal = parseFloat(cur.value);
  if (isNaN(curVal)) return null;
  const prevVal = prev ? parseFloat(prev.value) : NaN;
  const change = !isNaN(prevVal) ? curVal - prevVal : null;
  const changePct = !isNaN(prevVal) && prevVal !== 0 ? (change! / prevVal) * 100 : null;
  return {
    current: { value: curVal, period: cur.period, year: cur.year, date: `${cur.year}-${cur.period}` },
    previous: !isNaN(prevVal) && prev
      ? { value: prevVal, period: prev.period, year: prev.year, date: `${prev.year}-${prev.period}` }
      : null,
    change,
    changePct,
  };
}

let blsKeyRejected = false;

async function callBls(useKey: boolean): Promise<BlsResponse> {
  const now = new Date();
  const endYear = String(now.getUTCFullYear());
  const startYear = String(now.getUTCFullYear() - 1);
  const body: Record<string, unknown> = {
    seriesid: [SERIES_CPI, SERIES_UNEMPLOYMENT],
    startyear: startYear,
    endyear: endYear,
  };
  const key = (process.env.BLS_API_KEY || "").trim();
  if (useKey && key) body.registrationkey = key;
  const res = await fetch(BLS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`BLS HTTP ${res.status}`);
  return (await res.json()) as BlsResponse;
}

export async function fetchBLSMacro(): Promise<BlsMacro | null> {
  if (blsCache) {
    const ttl = blsCache.value ? BLS_CACHE_TTL_OK_MS : BLS_CACHE_TTL_FAIL_MS;
    if (Date.now() - blsCache.ts < ttl) return blsCache.value;
  }
  try {
    const haveKey = !!(process.env.BLS_API_KEY || "").trim();
    const tryWithKey = haveKey && !blsKeyRejected;
    let json = await callBls(tryWithKey);
    if (
      tryWithKey &&
      json.status === "REQUEST_NOT_PROCESSED" &&
      (json.message ?? []).some((m) => /invalid|key/i.test(m))
    ) {
      logger.warn("macro-data: BLS rejected registration key — falling back to unregistered access");
      blsKeyRejected = true;
      json = await callBls(false);
    }
    if (json.status && json.status !== "REQUEST_SUCCEEDED") {
      throw new Error(`BLS status=${json.status}: ${(json.message ?? []).join("; ")}`);
    }
    const seriesArr = json.Results?.series ?? [];
    const cpiData = seriesArr.find((s) => s.seriesID === SERIES_CPI)?.data;
    const unempData = seriesArr.find((s) => s.seriesID === SERIES_UNEMPLOYMENT)?.data;
    const value: BlsMacro = {
      cpi: parseSeries(cpiData),
      unemployment: parseSeries(unempData),
      asOf: new Date().toISOString(),
    };
    blsCache = { value, ts: Date.now() };
    return value;
  } catch (e: any) {
    logger.warn(`macro-data: fetchBLSMacro failed — ${e?.message ?? e}`);
    blsCache = { value: null, ts: Date.now() };
    return null;
  }
}

export async function fetchCPI(): Promise<BlsSeries | null> {
  const m = await fetchBLSMacro();
  return m?.cpi ?? null;
}

export async function fetchUnemploymentRate(): Promise<BlsSeries | null> {
  const m = await fetchBLSMacro();
  return m?.unemployment ?? null;
}

export async function fetchMacroContext(): Promise<string> {
  const [fed, bls] = await Promise.all([getFedFundsRate(), fetchBLSMacro()]);
  const lines: string[] = [];
  if (fed) {
    lines.push(
      `- Fed Funds Rate: ${fed.effective.toFixed(2)}% effective (target ${fed.targetLower.toFixed(2)}–${fed.targetUpper.toFixed(2)}%) as of ${fed.asOf || "latest"}`
    );
  }
  if (bls?.cpi) {
    const c = bls.cpi;
    const yoy = c.changePct != null ? ` (${c.changePct >= 0 ? "+" : ""}${c.changePct.toFixed(2)}% MoM)` : "";
    lines.push(`- CPI (All Urban Consumers): ${c.current.value.toFixed(3)}${yoy} — period ${c.current.date}`);
  }
  if (bls?.unemployment) {
    const u = bls.unemployment;
    const delta = u.change != null ? ` (${u.change >= 0 ? "+" : ""}${u.change.toFixed(2)}pp MoM)` : "";
    lines.push(`- Unemployment Rate (SA): ${u.current.value.toFixed(2)}%${delta} — period ${u.current.date}`);
  }
  if (lines.length === 0) return "";
  return `\n\nMACRO CONTEXT:\n${lines.join("\n")}`;
}
