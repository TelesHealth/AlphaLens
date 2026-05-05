import { RSI, MACD, SMA, BollingerBands } from "@debut/indicators";
import { logger } from "../lib/logger";

export interface TechnicalSignals {
  ticker: string;
  timestamp: string;
  rsi: { value: number; signal: string } | null;
  macd: {
    value: number;
    signalLine: number;
    histogram: number;
    signal: string;
  } | null;
  movingAverages: {
    sma20: number;
    sma50: number;
    signal: string;
  } | null;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    bandWidth: number;
    signal: string;
  } | null;
  overallTASignal: string;
  taBullishCount: number;
  taBearishCount: number;
  taNeutralCount: number;
}

function streamRSI(prices: number[], period = 14): number | null {
  try {
    const r = new RSI(period);
    let last = NaN;
    for (const p of prices) last = r.nextValue(p);
    return Number.isFinite(last) ? last : null;
  } catch (e: any) {
    logger.warn({ err: e.message }, "TA: RSI failed");
    return null;
  }
}

function streamMACD(
  prices: number[],
): { macd: number; signal: number; histogram: number } | null {
  try {
    const m = new MACD(12, 26, 9);
    let last: ReturnType<typeof m.nextValue> | null = null;
    for (const p of prices) last = m.nextValue(p);
    if (
      !last ||
      !Number.isFinite(last.macd) ||
      !Number.isFinite(last.signal) ||
      !Number.isFinite(last.histogram)
    ) {
      return null;
    }
    return { macd: last.macd, signal: last.signal, histogram: last.histogram };
  } catch (e: any) {
    logger.warn({ err: e.message }, "TA: MACD failed");
    return null;
  }
}

function macdHistTrend(prices: number[]): number | null {
  try {
    const m = new MACD(12, 26, 9);
    let prev: number | null = null;
    let last: number | null = null;
    for (const p of prices) {
      const v = m.nextValue(p);
      if (Number.isFinite(v.histogram)) {
        prev = last;
        last = v.histogram;
      }
    }
    if (prev == null || last == null) return null;
    return last - prev;
  } catch {
    return null;
  }
}

function streamSMA(prices: number[], period: number): number | null {
  try {
    const s = new SMA(period);
    let last = NaN;
    for (const p of prices) last = s.nextValue(p);
    return Number.isFinite(last) ? last : null;
  } catch (e: any) {
    logger.warn({ err: e.message, period }, "TA: SMA failed");
    return null;
  }
}

function streamBands(
  prices: number[],
): { upper: number; middle: number; lower: number } | null {
  try {
    const b = new BollingerBands(20, 2);
    let last: ReturnType<typeof b.nextValue> | null = null;
    for (const p of prices) last = b.nextValue(p);
    if (
      !last ||
      !Number.isFinite(last.upper) ||
      !Number.isFinite(last.middle) ||
      !Number.isFinite(last.lower)
    ) {
      return null;
    }
    return { upper: last.upper, middle: last.middle, lower: last.lower };
  } catch (e: any) {
    logger.warn({ err: e.message }, "TA: BollingerBands failed");
    return null;
  }
}

export function getTechnicalSignals(
  ticker: string,
  prices: number[],
): TechnicalSignals | null {
  if (!Array.isArray(prices) || prices.length < 50) return null;
  const currentPrice = prices[prices.length - 1];
  if (!Number.isFinite(currentPrice)) return null;

  const rsiVal = streamRSI(prices, 14);
  let rsi: TechnicalSignals["rsi"] = null;
  if (rsiVal != null) {
    const sig = rsiVal > 70 ? "overbought" : rsiVal < 30 ? "oversold" : "neutral";
    rsi = { value: Math.round(rsiVal * 100) / 100, signal: sig };
  }

  const macdRaw = streamMACD(prices);
  const histTrend = macdHistTrend(prices);
  let macd: TechnicalSignals["macd"] = null;
  if (macdRaw) {
    let macdSig: string;
    if (macdRaw.macd > macdRaw.signal) macdSig = "bullish_crossover";
    else if (macdRaw.macd < macdRaw.signal) macdSig = "bearish_crossover";
    else macdSig = "neutral";
    if (
      macdRaw.histogram > 0 &&
      histTrend != null &&
      histTrend > 0
    ) {
      macdSig = "building_momentum_up";
    } else if (
      macdRaw.histogram < 0 &&
      histTrend != null &&
      histTrend < 0
    ) {
      macdSig = "building_momentum_down";
    }
    macd = {
      value: Math.round(macdRaw.macd * 1000) / 1000,
      signalLine: Math.round(macdRaw.signal * 1000) / 1000,
      histogram: Math.round(macdRaw.histogram * 1000) / 1000,
      signal: macdSig,
    };
  }

  const sma20 = streamSMA(prices, 20);
  const sma50 = streamSMA(prices, 50);
  let movingAverages: TechnicalSignals["movingAverages"] = null;
  if (sma20 != null && sma50 != null) {
    let maSig: string;
    if (currentPrice > sma20 && sma20 > sma50) maSig = "strong_uptrend";
    else if (currentPrice < sma20 && sma20 < sma50) maSig = "strong_downtrend";
    else if (sma20 > sma50) maSig = "golden_cross";
    else maSig = "death_cross";
    movingAverages = {
      sma20: Math.round(sma20 * 100) / 100,
      sma50: Math.round(sma50 * 100) / 100,
      signal: maSig,
    };
  }

  const bandsRaw = streamBands(prices);
  let bollingerBands: TechnicalSignals["bollingerBands"] = null;
  if (bandsRaw && bandsRaw.middle !== 0) {
    const bandWidth = (bandsRaw.upper - bandsRaw.lower) / bandsRaw.middle;
    const proximityToMean =
      Math.abs(currentPrice - bandsRaw.middle) /
      Math.max(bandsRaw.upper - bandsRaw.middle, 1e-9);
    let bbSig: string;
    if (currentPrice > bandsRaw.upper) bbSig = "above_upper_band";
    else if (currentPrice < bandsRaw.lower) bbSig = "below_lower_band";
    else if (proximityToMean < 0.25) bbSig = "at_mean";
    else bbSig = currentPrice > bandsRaw.middle ? "upper_half" : "lower_half";
    if (bandWidth < 0.1) bbSig = "low_volatility_squeeze";
    bollingerBands = {
      upper: Math.round(bandsRaw.upper * 100) / 100,
      middle: Math.round(bandsRaw.middle * 100) / 100,
      lower: Math.round(bandsRaw.lower * 100) / 100,
      bandWidth: Math.round(bandWidth * 1000) / 1000,
      signal: bbSig,
    };
  }

  const bullishSet = new Set([
    "oversold",
    "bullish_crossover",
    "building_momentum_up",
    "strong_uptrend",
    "golden_cross",
    "below_lower_band",
  ]);
  const bearishSet = new Set([
    "overbought",
    "bearish_crossover",
    "building_momentum_down",
    "strong_downtrend",
    "death_cross",
    "above_upper_band",
  ]);

  let bull = 0;
  let bear = 0;
  let neut = 0;
  const allSigs = [
    rsi?.signal,
    macd?.signal,
    movingAverages?.signal,
    bollingerBands?.signal,
  ].filter((s): s is string => !!s);
  for (const s of allSigs) {
    if (bullishSet.has(s)) bull++;
    else if (bearishSet.has(s)) bear++;
    else neut++;
  }

  let overall: string;
  if (bull >= 3) overall = "strongly_bullish";
  else if (bull === 2) overall = "bullish";
  else if (bear >= 3) overall = "strongly_bearish";
  else if (bear === 2) overall = "bearish";
  else overall = "mixed";

  return {
    ticker,
    timestamp: new Date().toISOString(),
    rsi,
    macd,
    movingAverages,
    bollingerBands,
    overallTASignal: overall,
    taBullishCount: bull,
    taBearishCount: bear,
    taNeutralCount: neut,
  };
}
