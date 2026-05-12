# UAT Build Decision Memo

**Drafted:** 2026-05-12
**Decision owner:** James
**Scope:** which build to ship to `arclion.ai` / `api.arclion.ai` ahead of UAT (target: Monday)

---

## A. Current state

### SHAs

| Surface | Active SHA | Date | Lag vs `main` |
|---|---|---|---|
| `main` (Replit dev) | `ab4bf71` | 2026-05-12T18:04:18Z | — |
| Railway (`api.arclion.ai`) | `43b7934` *(per James, Railway dashboard 2026-05-12)* | 2026-05-11T00:08:12Z | **6 commits / ~42 hours** |
| Vercel (`arclion.ai`) | **TBC by James** | — | — |

### Gap commit-by-commit (Railway `43b7934` → main `ab4bf71`)

Listed in chronological order. **Behavior** = changes runtime; **Doc** = no runtime impact.

| # | SHA | Date | Type | Surface | What it does |
|---|---|---|---|---|---|
| 1 | `524acef` | 2026-05-11T00:44Z | Behavior | Frontend (Vercel) | Raised the daily trade limit constant in `trading.tsx`. 1-line change. |
| 2 | `f75cc1a` | 2026-05-12T16:51Z | Doc | None | Attached-assets text file from the order-approval investigation. No code touched. |
| 3 | `f6943ed` | 2026-05-12T17:32Z | Behavior | Backend (Railway) | Structured pino logging on approve/reject + `logLiveTrade` returns inserted id. **Pure logging — no business-logic change**. Also added `POST_UAT_POLISH.md` doc. |
| 4 | `17d0496` | 2026-05-12T17:44Z | Doc | None | Added `EDGE_CALC_PROJECT_TASK_BRIEF.md` + `.agents` metadata entry. No code touched. |
| 5 | `4a9ad2a` | 2026-05-12T17:48Z | Doc | None | Brief revision (scope discipline section) + attached-assets text. No code touched. |
| 6 | `ab4bf71` | 2026-05-12T18:04Z | Behavior | Backend (Railway) | **Edge Calc R1 + R2 merge.** Extends `refreshRecommendationEdges()` to backfill NULL `edge_type`/`conviction_score` for legacy rows. Adds scanner descope note to `POST_UAT_POLISH.md`. Touches **only `market-data.ts` (+25 lines)** plus the doc. |

### What this means by surface

**Vercel (frontend):** only `524acef` is frontend-relevant — a 1-line trade-limit constant bump in `trading.tsx`. Everything else in the gap is backend or docs.

**Railway (backend):** two behavior commits — `f6943ed` (logging only, zero risk to existing endpoints) and `ab4bf71` (Edge Calc backfill, runs only inside the 5-min refresh cron, does not touch any user-facing endpoint).

**Crucially:** none of the 6 gap commits touch the approve/reject/history code paths in a way that changes their externally-observable behavior. Charlize's #29/#30 retest path is identical between `43b7934` and `ab4bf71` *in terms of HTTP response shape and DB writes*. The only Railway-side difference Charlize would observe is **richer log output** (helpful for triage if something breaks) and **a backfilled `edge_type`/`conviction_score` on previously-NULL legacy rows** (visible only if she queries those specific historical rows).

---

## B. Three deploy options for UAT Monday

### Option A — Ship current `main` (`ab4bf71`)

Includes: trade limit bump + structured logging + Edge Calc R1+R2 backfill.

**Pros:**
- "Main = deployed" invariant is honest. No drift between what's running and what's reviewable in the repo.
- Charlize gets the new structured logging on approve/reject — if a real P1 surfaces during UAT, log triage is dramatically faster (specific orderId, userId, liveTradeId on every event vs. opaque "Error approving order").
- Edge Calc backfill runs forward-running and idempotent — even if a NULL row sneaks in during UAT for any reason, the next 5-min cycle catches it.
- One deploy now, no further deploys needed during UAT week.

**Cons:**
- Edge Calc backfill loop is **untested in production** until it runs there. Replit dev DB had 116 NULL open rows; production may have a different distribution. Failure mode is silent (backfill no-ops), not loud (server crash) — but it's a behavior change being introduced concurrently with UAT.
- The 1-line trade-limit bump in `524acef` is also untested in production.
- If anything goes sideways during UAT week and you need to roll back, you roll back to a 2-day-old SHA which loses all the new logging — exactly when you most need it.
- Railway redeploy invalidates Charlize's mid-flight retest if she has session state (cookies, in-memory queries). Safer to coordinate the deploy with her cycle boundary.

**Risk level:** LOW–MEDIUM. The new code is small (≈25 LOC behavior change beyond logging) and well-bounded.

---

### Option B — Ship `f6943ed` (logging only, pre-Edge-Calc)

Requires reverting `ab4bf71` on `main` first to keep "main = deployed" invariant honest. Then redeploy.

**Pros:**
- Keeps Edge Calc backfill out of production until after UAT closes — exactly the original intent of the freeze.
- Still gets Charlize the structured logging on approve/reject (the most valuable thing in the gap for UAT triage).
- Reverting `ab4bf71` is mechanically clean: it's an isolated commit touching only `market-data.ts` (+25 lines) and a doc. `git revert ab4bf71` would produce a no-conflict revert commit. Edge Calc work isn't lost — the merge is preserved in history and can be re-applied post-UAT with a single `git revert <revert-sha>`.
- Honors your stated intent ("codebase freezes during UAT and Edge Calc must wait for my all-clear after UAT closes"). The fact that Task #1 got approved and merged anyway during the freeze window was an accident; this option corrects course.

**Cons:**
- Requires a `git revert` on `main` — destructive operation that needs a Project Task per the sandbox rules. Adds operational complexity (and per directive 3, you'd need to explicitly approve spinning up that task by name).
- The trade-limit bump in `524acef` still ships either way — no isolation there.
- Two deploys needed instead of one (this one now, then post-UAT to bring Edge Calc back).
- If you'd already mentally accepted Edge Calc shipping (per the merge happening), reverting feels like extra paperwork for marginal safety gain.

**Risk level:** LOW. The revert is mechanically simple; the deployed surface is identical to what's been running for 42 hours plus a logging-only diff.

---

### Option C — Status quo, ship nothing new

Leave Railway on `43b7934` and Vercel on whatever it's currently serving until after UAT.

**Pros:**
- Maximum safety. The deployed surface has been running for 42 hours with no reported production incidents — known-good.
- Zero deploy risk during UAT week. Whatever breaks during UAT is unambiguously "in the code that's been running for 2 days," not "introduced by Friday's deploy."
- Honors the freeze most strictly.

**Cons:**
- Charlize tests against a production surface that is **2 days behind `main`**. Any P1 she finds will have an immediate question: "is this fixed in `f6943ed` or `ab4bf71` already, or is it a real production issue?" — every report needs a cross-check against `main`.
- Approve/reject diagnostics in production stay opaque (no structured logging). If a real P1 surfaces, triage is slower. The whole point of `f6943ed` was to give Charlize better signal during exactly this UAT window.
- Bug #29/#30 retest happens against pre-fix code — but you and I already concluded they're not reproducible bugs in current code, so this is more about confidence than correctness.
- "Main = deployed" invariant is broken for the entire UAT week. Easy to lose track of what's actually running.

**Risk level:** VERY LOW operationally, MEDIUM for triage quality if a real P1 lands.

---

## C. Recommendation

**Option B — ship `f6943ed` (logging only) after reverting `ab4bf71` on `main`.**

The single biggest UAT-week risk is not "Edge Calc breaks" — it's "a real P1 surfaces and nobody can triage it from production logs." That's exactly what `f6943ed` was built for, and it's why we wrote it Friday morning before knowing UAT timing was tight. Shipping it gives Charlize and you the diagnostic surface you'll need if things go sideways.

Edge Calc, by contrast, has zero UAT value. It runs in a background cron, touches no UI, fixes no UAT-blocking bug, and its only positive effect is making historical analytics slightly more complete. There is no upside to shipping it during UAT and a real (if small) downside to introducing untested behavior change concurrent with the test window. The fact that it merged during the freeze was a process accident; not shipping it is the cleanest correction. The work is preserved in `main`'s history and is one revert-of-revert away post-UAT.

The mechanical cost — one revert commit, one Railway redeploy — is small. The cost of having UAT-week production diverge from `main` for 5 days (Option C) or shipping concurrent untested behavior (Option A) is larger.

**One caveat:** this recommendation hinges on you confirming Vercel's current SHA. If Vercel is also on `43b7934`-era code, Option B works as described. If Vercel has already auto-deployed `ab4bf71` (frontend bundle is functionally identical because the merge has zero `alpha-lens/` source changes — but it's still a different SHA), the situation is more nuanced and Option A may become operationally simpler. Get the Vercel SHA first, then decide.

---

## What I am NOT doing in this memo

- No git operations executed.
- No deploys triggered.
- No Project Tasks created (per directive 3).
- No revert commit drafted.

You make the call. I'll execute whatever you direct, including spinning up a Project Task for the revert if you go Option B and explicitly name it.
