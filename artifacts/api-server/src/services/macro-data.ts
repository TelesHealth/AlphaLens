import { logger } from "../lib/logger";

const NY_FED_EFFR = "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json";

export interface FedFundsRate {
  effective: number;
  targetUpper: number;
  targetLower: number;
  asOf: string;
}

interface CacheEntry {
  value: FedFundsRate | null;
  ts: number;
}

const CACHE_TTL_OK_MS = 6 * 60 * 60 * 1000;
const CACHE_TTL_FAIL_MS = 2 * 60 * 1000;
let cache: CacheEntry | null = null;

interface NyFedResponse {
  refRates?: Array<{
    effectiveDate?: string;
    percentRate?: number;
    targetRateFrom?: number;
    targetRateTo?: number;
  }>;
}

export async function getFedFundsRate(): Promise<FedFundsRate | null> {
  if (cache) {
    const ttl = cache.value ? CACHE_TTL_OK_MS : CACHE_TTL_FAIL_MS;
    if (Date.now() - cache.ts < ttl) return cache.value;
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
    cache = { value, ts: Date.now() };
    return value;
  } catch (e: any) {
    logger.warn(`macro-data: getFedFundsRate failed — ${e?.message ?? e}`);
    cache = { value: null, ts: Date.now() };
    return null;
  }
}
