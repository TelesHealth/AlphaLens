import { Router } from "express";
import {
  getActiveAlerts,
  getAlertHistory,
  getPriceMonitor,
  getRadarStatus,
  runRadarScan,
  CHAIN_REACTIONS,
  SPIKE_THRESHOLDS,
} from "../services/market-radar";
import {
  fetchOptionsFlowAlerts,
  fetchDarkPoolAlerts,
  fetchCongressionalTrades,
  fetchCryptoWhaleAlerts,
} from "../services/unusual-whales";
import { logger } from "../lib/logger";

const router = Router();

let scanInProgress = false;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

router.get("/alerts", async (req, res) => {
  try {
    const hours = clamp(parseInt(req.query.hours as string) || 4, 1, 24);
    const alertType = (req.query.type as string) || undefined;
    const severity = (req.query.severity as string) || undefined;
    const rawAlerts = await getActiveAlerts(hours, alertType, severity);
    const alerts = rawAlerts.map((a) => ({
      ...a,
      chainAssets: a.chainAssets ?? [],
      confidence: a.confidence ?? null,
      reason: a.reason ?? null,
      pctChange: a.pctChange ?? null,
      direction: a.direction ?? null,
    }));
    res.json({ alerts, total: alerts.length, generatedAt: new Date().toISOString() });
  } catch (e: any) {
    logger.error({ err: e.message }, "GET /radar/alerts failed");
    res.status(500).json({ error: "Failed to fetch radar alerts" });
  }
});

router.get("/prices", async (_req, res) => {
  try {
    const prices = await getPriceMonitor();
    const sorted = [...prices].sort(
      (a, b) => Math.abs(b.pctChange ?? 0) - Math.abs(a.pctChange ?? 0)
    );
    res.json({ prices: sorted, total: sorted.length, updatedAt: new Date().toISOString() });
  } catch (e: any) {
    logger.error({ err: e.message }, "GET /radar/prices failed");
    res.status(500).json({ error: "Failed to fetch radar prices" });
  }
});

router.post("/scan", async (_req, res) => {
  if (scanInProgress) {
    res.json({ status: "scan_already_running", message: "A radar scan is already in progress. Check /api/radar/alerts shortly." });
    return;
  }
  scanInProgress = true;
  res.json({ status: "scan_started", message: "Radar scan running in background. Check /api/radar/alerts in ~30 seconds." });
  runRadarScan()
    .catch((e) => logger.error({ err: e.message }, "Background radar scan failed"))
    .finally(() => { scanInProgress = false; });
});

router.get("/chains/:assetId", (req, res) => {
  const assetId = req.params.assetId;
  const chains = CHAIN_REACTIONS[assetId] || [];
  res.json({
    assetId,
    chains,
    total: chains.length,
    note: `When ${assetId.replace(/_/g, " ").toUpperCase()} moves significantly, these assets are typically affected.`,
  });
});

router.get("/chains", (_req, res) => {
  res.json({
    chains: CHAIN_REACTIONS,
    totalAssets: Object.keys(CHAIN_REACTIONS).length,
    note: "Full cross-asset correlation map. Each key is a trigger asset; value is list of downstream effects.",
  });
});

router.get("/thresholds", (_req, res) => {
  res.json({
    thresholds: SPIKE_THRESHOLDS,
    total: Object.keys(SPIKE_THRESHOLDS).length,
    note: "Configure spike sensitivity. pct = percentage move, window = minutes to detect it in.",
  });
});

router.get("/history", async (req, res) => {
  try {
    const days = clamp(parseInt(req.query.days as string) || 7, 1, 30);
    const limit = clamp(parseInt(req.query.limit as string) || 100, 1, 500);
    const { alerts, byType, bySeverity } = await getAlertHistory(days, limit);
    res.json({ alerts, total: alerts.length, byType, bySeverity, periodDays: days });
  } catch (e: any) {
    logger.error({ err: e.message }, "GET /radar/history failed");
    res.status(500).json({ error: "Failed to fetch radar history" });
  }
});

router.get("/status", (_req, res) => {
  res.json(getRadarStatus());
});

router.get("/options-flow", async (req, res) => {
  if (!process.env.UNUSUAL_WHALES_KEY) {
    res.status(503).json({ error: "Unusual Whales not configured — add UNUSUAL_WHALES_KEY to Secrets" });
    return;
  }
  try {
    const limit = clamp(parseInt(req.query.limit as string) || 20, 1, 100);
    const alerts = await fetchOptionsFlowAlerts();
    res.json({ alerts: alerts.slice(0, limit), total: alerts.length, source: "Unusual Whales" });
  } catch (e: any) {
    logger.error({ err: e.message }, "GET /radar/options-flow failed");
    res.status(500).json({ error: "Failed to fetch options flow" });
  }
});

router.get("/dark-pool", async (req, res) => {
  if (!process.env.UNUSUAL_WHALES_KEY) {
    res.status(503).json({ error: "Unusual Whales not configured — add UNUSUAL_WHALES_KEY to Secrets" });
    return;
  }
  try {
    const limit = clamp(parseInt(req.query.limit as string) || 20, 1, 100);
    const trades = await fetchDarkPoolAlerts();
    res.json({ trades: trades.slice(0, limit), total: trades.length, source: "Unusual Whales Dark Pool" });
  } catch (e: any) {
    logger.error({ err: e.message }, "GET /radar/dark-pool failed");
    res.status(500).json({ error: "Failed to fetch dark pool data" });
  }
});

router.get("/congress", async (req, res) => {
  if (!process.env.UNUSUAL_WHALES_KEY) {
    res.status(503).json({ error: "Unusual Whales not configured — add UNUSUAL_WHALES_KEY to Secrets" });
    return;
  }
  try {
    const limit = clamp(parseInt(req.query.limit as string) || 20, 1, 100);
    const trades = await fetchCongressionalTrades();
    res.json({ trades: trades.slice(0, limit), total: trades.length, source: "Unusual Whales Congress" });
  } catch (e: any) {
    logger.error({ err: e.message }, "GET /radar/congress failed");
    res.status(500).json({ error: "Failed to fetch congressional trades" });
  }
});

router.get("/crypto-whales", async (req, res) => {
  if (!process.env.UNUSUAL_WHALES_KEY) {
    res.status(503).json({ error: "Unusual Whales not configured — add UNUSUAL_WHALES_KEY to Secrets" });
    return;
  }
  try {
    const limit = clamp(parseInt(req.query.limit as string) || 20, 1, 100);
    const transactions = await fetchCryptoWhaleAlerts();
    res.json({ transactions: transactions.slice(0, limit), total: transactions.length, source: "Unusual Whales Crypto" });
  } catch (e: any) {
    logger.error({ err: e.message }, "GET /radar/crypto-whales failed");
    res.status(500).json({ error: "Failed to fetch crypto whale data" });
  }
});

export default router;
