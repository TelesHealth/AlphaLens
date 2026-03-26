import cron from "node-cron";
import { logger } from "../lib/logger";
import { refreshAllMarketData } from "./market-data";

let isRefreshing = false;

async function safeRefresh() {
  if (isRefreshing) {
    logger.info("Market refresh already in progress, skipping");
    return;
  }
  isRefreshing = true;
  try {
    await refreshAllMarketData();
  } catch (e: any) {
    logger.error({ err: e.message }, "Scheduled market refresh failed");
  } finally {
    isRefreshing = false;
  }
}

export function startScheduler() {
  cron.schedule("*/5 * * * *", () => {
    safeRefresh();
  });

  logger.info("Scheduler started: market data refresh every 5 minutes");

  setTimeout(() => {
    logger.info("Running initial market data refresh...");
    safeRefresh();
  }, 3000);
}
