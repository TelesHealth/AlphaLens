import cron from "node-cron";
import { db } from "@workspace/db";
import { assetsTable } from "@workspace/db/schema";
import { logger } from "../lib/logger";
import { refreshAllMarketData } from "./market-data";
import { scanForRecommendations } from "./recommendations";
import { runRadarScan } from "./market-radar";
import { runOutcomeResolution } from "./outcome-resolver";
import { scoreMarketWithAI } from "./scoring";

let isScanning = false;
let isResolving = false;
let isDeepScoring = false;
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

// P2-6 (v2): Scheduled "Trigger Deep Analysis" pass.
// The user-facing "Trigger Deep Analysis" button on /market/:id calls
// scoreMarketWithAI for ONE asset. This job runs the same scoring across
// EVERY asset in the catalog on a 5-minute cadence so `lastScoredAt` stays
// fresh without anyone needing to click the button manually.
//
// Concurrency model:
//   - One global `isDeepScoring` lock. If a previous cycle is still
//     running when the next tick fires (e.g. catalog is large or
//     Anthropic is slow), we skip cleanly instead of stacking cycles.
//   - Inside a cycle we score sequentially with a small per-asset delay
//     to avoid hammering the Anthropic API. scoreMarketWithAI already
//     persists lastScoredAt on each row, so partial cycles still leave
//     the UI in a usable state.
// Freshness threshold: assets scored within this window are considered
// "fresh enough" for the 5-minute cadence and are skipped on the next
// cycle. This is the key guardrail that prevents the same asset from
// being re-scored within a single 5-min window when a long cycle (e.g.
// 7-8 min on a large catalog) overlaps the next tick.
const DEEP_SCORE_FRESHNESS_MS = 4 * 60 * 1000; // 4 minutes

async function safeDeepScoreAll() {
  if (isDeepScoring) {
    logger.info("Deep-analysis cycle already in progress, skipping tick");
    return;
  }
  isDeepScoring = true;
  const startedAt = Date.now();
  try {
    const assets = await db.select().from(assetsTable);
    // Skip assets whose lastScoredAt is within the freshness window —
    // this means a long-running previous cycle won't cause us to re-score
    // assets that were just scored, and it caps Anthropic call volume to
    // roughly catalogSize / (5 min) regardless of how slow the API is.
    const now = Date.now();
    const due = assets.filter((a) => {
      if (!a.lastScoredAt) return true;
      return now - new Date(a.lastScoredAt).getTime() >= DEEP_SCORE_FRESHNESS_MS;
    });
    logger.info(
      { total: assets.length, due: due.length, skippedFresh: assets.length - due.length },
      "Deep-analysis cycle starting",
    );
    let ok = 0;
    let failed = 0;
    for (const asset of due) {
      try {
        await scoreMarketWithAI(asset);
        ok++;
      } catch (err: any) {
        failed++;
        logger.warn(
          { err: err?.message ?? err, assetId: asset.id, symbol: asset.symbol },
          "Deep-analysis scoring failed for asset",
        );
      }
      // Light throttle between calls (200ms) so we don't burst the
      // Anthropic API on large catalogs.
      await new Promise((r) => setTimeout(r, 200));
    }
    const elapsedMs = Date.now() - startedAt;
    logger.info(
      { ok, failed, scored: due.length, totalCatalog: assets.length, elapsedMs },
      "Deep-analysis cycle complete",
    );
  } catch (e: any) {
    logger.error({ err: e?.message ?? e }, "Deep-analysis cycle errored");
  } finally {
    isDeepScoring = false;
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

  // P2-6 (v2): Deep AI analysis cron — equivalent to clicking "Trigger
  // Deep Analysis" on every asset, every 5 minutes.
  cron.schedule("*/5 * * * *", () => {
    safeDeepScoreAll();
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
    "Scheduler started: markets(5min) · recommendations(30min) · radar(5min) · deep-analysis(5min) · outcome-resolution(daily 9:00 UTC + startup catch-up)",
  );

  setTimeout(() => {
    logger.info("Running initial market data refresh...");
    safeRefresh();
  }, 3000);

  // Kick the first deep-analysis cycle ~30s after boot (after the
  // initial price refresh has had a chance to seed currentPrice / 24h
  // change) so the very first run already has fresh inputs to score on.
  setTimeout(() => {
    logger.info("Running initial deep-analysis cycle...");
    safeDeepScoreAll();
  }, 30_000);

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
