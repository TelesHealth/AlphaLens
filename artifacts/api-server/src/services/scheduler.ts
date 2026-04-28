import cron from "node-cron";
import { logger } from "../lib/logger";
import { refreshAllMarketData } from "./market-data";
import { scanForRecommendations } from "./recommendations";
import { runRadarScan } from "./market-radar";
import { runOutcomeResolution } from "./outcome-resolver";

let isScanning = false;
let isResolving = false;
// Note: the radar-scan lock now lives inside runRadarScan() in market-radar.ts
// (single source of truth shared with the manual POST /api/radar/scan route).

async function safeRefresh() {
  try {
    await refreshAllMarketData(false);
  } catch (e: any) {
    logger.error({ err: e.message }, "Scheduled market refresh failed");
  }
}

async function safeScan() {
  if (isScanning) {
    logger.info("Recommendations scan already in progress, skipping");
    return;
  }
  isScanning = true;
  try {
    await scanForRecommendations();
  } catch (e: any) {
    logger.error({ err: e.message }, "Scheduled recommendations scan failed");
  } finally {
    isScanning = false;
  }
}

async function safeOutcomeResolution() {
  if (isResolving) {
    logger.info("Outcome resolution already in progress, skipping");
    return;
  }
  isResolving = true;
  try {
    await runOutcomeResolution();
  } catch (e: any) {
    logger.error({ err: e?.message ?? e }, "Scheduled outcome resolution failed");
  } finally {
    isResolving = false;
  }
}

async function safeRadarScan() {
  try {
    // runRadarScan() owns the concurrency lock. If a scan is already running
    // (e.g. triggered manually via POST /api/radar/scan), it returns
    // { status: "scan_already_running" } instead of starting a second scan.
    const result = await runRadarScan();
    if (result.status === "scan_already_running") {
      logger.info("Scheduled radar scan skipped — another scan is already running");
      return;
    }
    logger.info({ count: result.count }, "Radar scan complete");
  } catch (e: any) {
    logger.error({ err: e.message }, "Scheduled radar scan failed");
  }
}

export function startScheduler() {
  cron.schedule("*/5 * * * *", () => {
    safeRefresh();
  });

  cron.schedule("*/30 * * * *", () => {
    safeScan();
  });

  cron.schedule("*/5 * * * *", () => {
    safeRadarScan();
  });

  // Daily outcome resolution — 9:00 AM UTC. Pin timezone explicitly so this
  // does not drift on hosts that default to a non-UTC system timezone.
  cron.schedule(
    "0 9 * * *",
    () => {
      safeOutcomeResolution();
    },
    { timezone: "UTC" },
  );

  logger.info(
    "Scheduler started: markets(5min) · recommendations(30min) · radar(5min) · outcome-resolution(daily 9:00 UTC)",
  );

  setTimeout(() => {
    logger.info("Running initial market data refresh...");
    safeRefresh();
  }, 3000);
}
