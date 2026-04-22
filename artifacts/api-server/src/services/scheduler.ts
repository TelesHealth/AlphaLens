import cron from "node-cron";
import { logger } from "../lib/logger";
import { refreshAllMarketData } from "./market-data";
import { scanForRecommendations } from "./recommendations";
import { runRadarScan } from "./market-radar";

let isScanning = false;
let isRadarScanning = false;

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

async function safeRadarScan() {
  if (isRadarScanning) {
    logger.info("Radar scan already in progress, skipping");
    return;
  }
  isRadarScanning = true;
  try {
    const result = await runRadarScan();
    logger.info({ count: result.count }, "Radar scan complete");
  } catch (e: any) {
    logger.error({ err: e.message }, "Scheduled radar scan failed");
  } finally {
    isRadarScanning = false;
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

  logger.info("Scheduler started: markets(5min) · recommendations(30min) · radar(5min)");

  setTimeout(() => {
    logger.info("Running initial market data refresh...");
    safeRefresh();
  }, 3000);
}
