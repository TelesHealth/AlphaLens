import { Router } from "express";
import * as uw from "../services/unusual-whales.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ configured: uw.isConfigured() });
});

router.get("/flow-alerts", async (_req, res) => {
  if (!uw.isConfigured()) { res.status(503).json({ error: "Unusual Whales not configured" }); return; }
  try {
    const alerts = await uw.getFlowAlerts();
    res.json({ alerts });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

router.get("/flow-summary", async (_req, res) => {
  if (!uw.isConfigured()) { res.status(503).json({ error: "Unusual Whales not configured" }); return; }
  try {
    const summary = await uw.getFlowSummary();
    res.json(summary);
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

router.get("/darkpool", async (_req, res) => {
  if (!uw.isConfigured()) { res.status(503).json({ error: "Unusual Whales not configured" }); return; }
  try {
    const prints = await uw.getDarkPoolRecent();
    res.json({ prints });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

router.get("/darkpool/:ticker", async (req, res) => {
  if (!uw.isConfigured()) { res.status(503).json({ error: "Unusual Whales not configured" }); return; }
  try {
    const prints = await uw.getDarkPoolTicker(req.params.ticker);
    res.json({ prints });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

router.get("/market-tide", async (_req, res) => {
  if (!uw.isConfigured()) { res.status(503).json({ error: "Unusual Whales not configured" }); return; }
  try {
    const ticks = await uw.getMarketTide();
    res.json({ ticks });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

router.get("/congress", async (_req, res) => {
  if (!uw.isConfigured()) { res.status(503).json({ error: "Unusual Whales not configured" }); return; }
  try {
    const trades = await uw.getCongressTrades();
    res.json({ trades });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

router.get("/crypto-whales", async (_req, res) => {
  if (!uw.isConfigured()) { res.status(503).json({ error: "Unusual Whales not configured" }); return; }
  try {
    const transactions = await uw.getCryptoWhales();
    res.json({ transactions });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

export default router;
