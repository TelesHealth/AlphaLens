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
    const alerts = await getActiveAlerts(hours, alertType, severity);
    res.json({ alerts, total: alerts.length, generatedAt: new Date().toISOString() });
  } catch (e: any) {
    logger.error({ err: e.message }, "GET /radar/alerts failed");
    res.status(500).json({ error: "Failed to fetch radar alerts" });
  }
});

router.get("/prices", async (_req, res) => {
  try {
    const prices = await getPriceMonitor();
    res.json({ prices, total: prices.length, updatedAt: new Date().toISOString() });
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

export default router;
