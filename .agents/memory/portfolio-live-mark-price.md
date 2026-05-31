---
name: Portfolio live mark price / unrealized P&L
description: Open positions must recompute pnl from live asset price; stored trade pnl is null until close.
---
# Portfolio open-position mark price (api-server routes/portfolio.ts)

`trades.pnl` / `pnlPercent` are only written when a trade is CLOSED — they are null/0 while open. The portfolio UI derives the displayed "Mark Price" from `pnl` (`mark = entry ± pnl/qty`), so returning the stored null made mark always equal entry.

**Fix/rule:** for OPEN trades, fetch each held asset's `assets.currentPrice` (same source the market scheduler updates and `/market/:id` reads) and overlay live `pnl`/`pnlPercent` on each request: long `pnl = (mark-entry)*qty`, short is the inverse; `pnlPercent = dir*(mark-entry)/entry*100`. Fall back to stored values if price/entry/qty is null. The frontend already polls (60s refetch) so the mark refreshes. Overlaying pnl (vs adding a new `currentPrice` field) keeps the API shape stable — no orval regen needed.
