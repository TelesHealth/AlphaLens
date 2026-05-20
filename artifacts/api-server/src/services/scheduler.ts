import cron from "node-cron";
import { logger } from "../lib/logger";
import { refreshAllMarketData } from "./market-data";
import { scanForRecommendations } from "./recommendations";
import { runRadarScan } from "./market-radar";
import { runOutcomeResolution } from "./outcome-resolver";

let isScanning = false;
let isResolving = false;
// P2-4: Track the last UTC date (YYYY-MM-DD) that outcome resolution ran
// so we can run a catch-up pass on server startup without double-running
// when the host restarts repeatedly within the same day. Without this
// guard, every container restart would trigger another full resolution
// sweep over thousands of open recs.
let lastResolutionDate: string | null = null;
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

async function safeOutcomeResolution(reason: "cron" | "startup" = "cron") {
  if (isResolving) {
    logger.info("Outcome resolution already in progress, skipping");
    return;
  }
  const todayUtc = new Date().toISOString().slice(0, 10);
  // Startup invocations only run if today's resolution hasn't happened yet
  // (either in this process or — checked downstream — in the DB). Cron
  // invocations always run; they're the authoritative daily pass.
  if (reason === "startup" && lastResolutionDate === todayUtc) {
    logger.info(
      { lastResolutionDate },
      "Startup outcome resolution skipped — already ran today",
    );
    return;
  }
  isResolving = true;
  try {
    logger.info({ reason }, "Running outcome resolution");
    await runOutcomeResolution();
    lastResolutionDate = todayUtc;
  } catch (e: any) {
    logger.error(
      { err: e?.message ?? e, reason },
      "Scheduled outcome resolution failed",
    );
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
      safeOutcomeResolution("cron");
    },
    { timezone: "UTC" },
  );

  logger.info(
    "Scheduler started: markets(5min) · recommendations(30min) · radar(5min) · outcome-resolution(daily 9:00 UTC + startup catch-up)",
  );

  setTimeout(() => {
    logger.info("Running initial market data refresh...");
    safeRefresh();
  }, 3000);

  // P2-4: Catch-up outcome resolution on startup. If the container
  // restarted AFTER 9:00 UTC on a given day, the daily cron has already
  // fired and won't run again until tomorrow — which previously caused
  // multi-day stretches with no leaderboard updates (e.g. May 6 → May 17
  // 2026 in production). Running once on startup (with the
  // lastResolutionDate guard above) closes that gap without risking
  // duplicate work on rapid restarts.
  setTimeout(() => {
    safeOutcomeResolution("startup");
  }, 15_000);
}
