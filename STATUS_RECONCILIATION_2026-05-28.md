# Status Reconciliation — 2026-05-28

**Investigator:** Replit Agent (read-only run, per James's instructions)
**Baseline:** James's last session, 2026-05-12T18:04Z, main HEAD `ab4bf71`.
**Scope:** Read-only reconciliation of git, deploy, project tasks, UAT, dedup, DB, and POST_UAT_POLISH against that baseline. **No source files modified except this document. No project tasks created or proposed. No git write ops, no deploys, no reverts.**

---

## ⚠️ NEEDS ATTENTION

Five items are in an unexpected state vs. the 2026-05-12 baseline. **No action taken — flagged for James only.**

1. **`ab4bf71` (Edge Calc R1+R2) was NEVER reverted.** It is still on main and is now buried under 38 subsequent commits. The "Option B" revert + redeploy of `f6943ed` that was recommended on 2026-05-12 was never executed. See §1.
2. **17 commits landed on `main` *during* the planned UAT freeze (≥ 2026-05-18).** James's last-session note said "codebase frozen during UAT." Whether these are technically "freeze violations" depends on James's definition (none are Project Task merges — they are direct main-branch agent commits — but the codebase was supposed to be frozen regardless). See §3 and §8.
3. **Signal Tracker win rate collapsed from 34.7 % → 10.30 %** over the two-week window (17 correct of 165 resolved). Resolved set grew from a handful to 165; open set grew from ~116 NULL legacy rows to **6 097 open recommendations** out of **6 262 total**. See §6.
4. **Scan-duplication signal is severe and unaddressed.** Top open-rec groupings: 937 open recs with `asset_id = NULL` direction `LONG`; 428 open `FED-CUT YES`; 420 open `BTC YES`; 401 open `GLD LONG`; 389 open `asset_id = NULL` direction `WATCH`. **No deduplication code was added** to `services/recommendations.ts`, `services/scheduler.ts`, or anywhere in `artifacts/api-server/src/`. **`SCAN_DEDUP_INVESTIGATION.md` was never produced.** See §5 and §6.
5. **No evidence UAT actually ran.** No bug-ticket files, no test-result spreadsheets, no Charlize-authored artifacts dated ≥ 2026-05-18 exist in the repo or `attached_assets/`. Bugs #28 / #29 / #30 are not referenced anywhere in the tracked repo. See §4.

---

## 1. Git / Commits

**Current `main` HEAD:** `ae09a47ab675d0a1c3fd977c61facd38e8312c11`
- Timestamp: `2026-05-25 09:19:19 +0000`
- Message: *"Improve card display and tooltip interactions on mobile devices"*

**Commits since `ab4bf71` (38 total, newest first):**

| SHA | Date (UTC) | Touches | One-line |
|---|---|---|---|
| `ae09a47` | 2026-05-25 09:19 | code | Improve card display and tooltip interactions on mobile devices |
| `c4bc09c` | 2026-05-25 09:08 | code | Improve mobile usability and responsiveness of cards and pages |
| `8563bdf` | 2026-05-22 04:10 | code | Round AI probabilities displayed on the scanner page |
| `9725814` | 2026-05-22 04:03 | code | Round AI and Market Probability scores on the market detail page |
| `f836f47` | 2026-05-22 04:02 | code | Preserve last AI scoring results when analysis temporarily fails |
| `b8b279a` | 2026-05-22 03:57 | code | Prevent text cutoff in trade call cards when expanded |
| `312b6ab` | 2026-05-22 03:50 | code | Enhance user experience across multiple platform pages |
| `54e480a` | 2026-05-22 03:29 | code | Improve font consistency and update data display formats |
| `a0ecd25` | 2026-05-22 03:10 | code | Improve AI coach response length and update market radar display |
| `c719bfa` | 2026-05-22 03:04 | code | Address bugs and enhance features across the codebase |
| `39c6b46` | 2026-05-20 08:18 | code | Update leaderboard to show newest items first and add pagination controls |
| `41874a1` | 2026-05-20 08:11 | code | Add pagination and filtering to the leaderboard to display all calls |
| `baa508f` | 2026-05-20 08:00 | code | Fix leaderboard date display due to timezone issues |
| `1133206` | 2026-05-20 07:57 | code | Improve spacing and layout for open position details |
| `b32d1f7` | 2026-05-20 07:51 | **code + schema** | Add persistent chat history and improve portfolio display (adds `coach_messages` table) |
| `4ac1a3e` | 2026-05-18 08:18 | code | Remove seconds counter from AI Coach thinking indicator |
| `52f0611` | 2026-05-18 08:05 | code | Improve AI coach response speed and update UI elements |
| `035f834` | (pre-5-18) | code | Fix crypto data display and AI coach loading issues |
| `ca0ced4` | " | code | Improve trade execution confirmation messages |
| `11f3f78` | " | code | Clarify position and entry amounts in the open positions table |
| `227f65f` | " | code | Add helpful tooltips and clarify prompts for users |
| `1a4a58e` | " | code | Integrate AI Coach features and improve navigation across the application |
| `07caa92` | " | code | Improve display of financial data and user feedback |
| `36ba349` | " | code | Update market radar and briefing pages with new features and fixes |
| `ea21701` | " | code | Improve chart readability and visual theme consistency |
| `467ac27` | " | code | Make paper trade option more visible and clear on recommendation cards |
| `0b44eea` | " | code | Improve clarity of technical indicators and AI coach prompts |
| `2f9f4be` | " | code | Improve navigation and trade history clarity for users |
| `f8b7499` | " | code | Add a way to display trade execution timestamps and distinguish between trade history and open positions |
| `e0a88ca` | " | code | Clarify confidence and conviction metrics with precise definitions |
| `0e35866` | " | code | Change trade buttons to show Yes/No for prediction markets |
| `d6c8e67` | " | code | Update labels on trading interface for prediction markets |
| `c9907b1` | " | code | Persist AI coach chat history across navigation |
| `3b1e8df` | " | code | Add chat history persistence to AI Coach |
| `68e0a55` | " | code | Fix conviction score display inconsistency between summary and analysis views |
| `c28c4e2` | " | code | Add a confirmation modal for paper trades to prevent accidental executions |
| `c1d5e3b` | " | code | Update paper trade button to use modal for amount entry and confirmation |
| `9af2ac7` | " | **doc** | Add a document outlining UAT build decision options |

All 38 commits touch code (35 of them) or docs (only `9af2ac7`, the UAT build memo). **Every other commit modifies source.**

**Was `ab4bf71` reverted?** **No.** `git log ab4bf71..HEAD --grep="revert\|Revert"` returns zero matches. `ab4bf71` is still part of `main`'s history with no compensating revert commit.

**Merge commits from Project Tasks?** **None.** `git log ab4bf71..HEAD --merges` returns zero entries. All 38 commits are direct (non-merge) commits to `main`.

---

## 2. Deployment State

**Replit dev environment SHA:** `ae09a47` (same as `main` HEAD; this Repl is the dev surface).

**API-server workflow:** **healthy / running.** Most recent log entries show the deep-analysis cycle, market-data refresh, and Kalshi/CoinGecko fetches all completing without errors.

**Local health endpoint:** `GET http://localhost:8080/api/healthz` → **HTTP 200**, body `{"status":"ok"}`. (The api-server binds to whatever `PORT` Replit assigns; on this Repl that resolved to 8080.)

**Railway / Vercel:** **Not visible from inside Replit.** I cannot query Railway or Vercel dashboards from this environment. To verify production yourself:

- **Railway (`api.arclion.ai`)** → Railway dashboard → your `arclion` project → **Deployments** tab → look at the top "Active" deployment. Compare its commit SHA against `ae09a47` (current main HEAD). If it is still `43b7934` from 2026-05-11, Railway is now ~40 commits / ~14 days behind. Also check the **Logs** tab and **Metrics** tab for any error spikes since 2026-05-12.
- **Vercel (`arclion.ai`)** → Vercel dashboard → your `arclion` project → **Deployments** tab → look at the row marked **Production**. Compare its "Commit" column SHA against `ae09a47`. If a non-`ae09a47` SHA is marked Production, Vercel is behind (or ahead) of main.

---

## 3. Project Tasks

Only **two** project tasks exist in this Repl. Pulled directly from the task store:

| Ref | Title | State | Created | Updated |
|---|---|---|---|---|
| #1 | Edge Calc Improvements (gap closure) | **MERGED** | 2026-05-12 17:48 UTC | 2026-05-12 18:04 UTC |
| #2 | Score the 11 leftover legacy recommendations… | **CANCELLED** | 2026-05-12 18:03 UTC | **2026-05-18 08:17 UTC** |

**Task #2 status:** **No longer hanging — it was moved to CANCELLED on 2026-05-18 08:17 UTC** (which is the morning of the planned UAT start). Its description currently reads: *"CANCELLED — Contradicts locked brief: the 11 resolved-NULL rows are intentionally not backfilled (per EDGE_CALC_PROJECT_TASK_BRIEF.md R2 acceptance criteria). Task should not have been proposed by the executor agent."* It is no longer awaiting James's UI rejection.

**New project tasks in the last 2 weeks?** **None.** The task list contains only #1 and #2. No new task has been created, proposed, or merged. **No project task merges to `main` occurred** (consistent with §1's zero-merge-commits result).

*Note on the freeze-violation question:* the standing rule was "no Project Tasks without explicit written approval naming the task." That rule was upheld — no new tasks were created. The 17 commits that landed during the freeze window (≥ 2026-05-18) are direct `main`-branch agent commits, not Project Task merges. See §8.

---

## 4. UAT Artifacts

**Search:** files in repo and `attached_assets/` modified after 2026-05-15.

**Findings:**
- **No UAT bug-report MD files.** `rg -ln "#28|#29|#30|Kalshi.*not configured"` returns zero matches across all tracked `.md` files (including `POST_UAT_POLISH.md`, `ARCLION*.md`, `README.md`, `replit.md`, and the entire `attached_assets/` tree).
- **No new spreadsheet exports** (xlsx/csv) added.
- **No tester-seeded user data** referenced in any new file.
- **`attached_assets/` files with modification time ≥ 2026-05-15:**

| Date | File |
|---|---|
| 2026-05-18 | `attached_assets/Pasted-Address-the-following-bugs-and-enhancements-across-the-_1779091149648.txt` |
| 2026-05-20 | `attached_assets/Pasted-Address-all-six-issues-below-in-a-single-pass-Work-thro_1779262801249.txt` |
| 2026-05-22 | `attached_assets/Pasted-Fix-the-following-bugs-and-enhancements-across-the-code_1779418955427.txt` |
| 2026-05-22 | `attached_assets/Pasted-Fix-the-following-bugs-and-enhancements-across-the-code_1779419085116.txt` |
| 2026-05-28 | `attached_assets/Pasted-Status-reconciliation-task-DO-NOT-write-code-DO-NOT-spi_1779971128480.txt` (this very task) |

These four pre-today files are agent prompts pasted in to drive feature/bug work — they are **not** Charlize-authored UAT bug tickets. Their filenames are James-style "address the following bugs and enhancements" prompts and they correlate 1:1 with bursts of `main` commits on those dates.

- **Bugs #28 / #29 / #30 (Kalshi "not configured", approve 500, rejected trades missing from history):** **No status info in the repo.** Zero references to those bug numbers exist in any tracked file. Nothing in commit messages references them by number either. I cannot tell from inside the Repl whether they were fixed, retested, or are still open — that information lives outside the repo (Charlize's tracker / James's notes).

**Net:** there is **no evidence inside this Repl that UAT actually ran** in any structured way during the 2026-05-18 → 2026-05-28 window.

---

## 5. Dedup Investigation

- **`SCAN_DEDUP_INVESTIGATION.md`:** **does not exist** at repo root. No file by that name exists anywhere in the tree (`find . -name "SCAN_DEDUP*"` → empty).
- **Code-level dedup logic:** **none added.** `rg -n "dedup|deduplicat|distinct.*open" artifacts/api-server/src/services/recommendations.ts artifacts/api-server/src/services/scheduler.ts` returns zero matches. A broader sweep `rg -ln "dedup|deduplicat" artifacts/api-server/src/` also returns zero matches. **No scan-deduplication has been implemented anywhere in the api-server source.**

The DB (§6) confirms the duplication is severe and growing.

---

## 6. DB / Signal State

(Queried live against this Repl's PostgreSQL DB on 2026-05-28.)

**Recommendation counts:**

| Metric | Today (2026-05-28) | Two weeks ago (per Edge Calc brief, 2026-05-12) | Δ |
|---|---|---|---|
| Total recs | **6 262** | 4 914 | **+1 348** |
| Open (`outcome IS NULL`) | **6 097** | 116 NULL legacy + active set | **+~5 980** |
| Resolved (`outcome IS NOT NULL`) | **165** | not stated in brief | — |
| Correct | **17** | — | — |
| Incorrect | **142** | — | — |
| Partial | **6** | — | — |
| Other outcomes | 0 | — | — |

**Win rate (correct / resolved):** **10.30 %** (17 / 165).
- Baseline 2 weeks ago: **34.7 %**.
- **Delta: −24.4 points.** The denominator grew significantly (165 resolved now vs. a much smaller resolved set previously), and almost all the new resolutions came in as `incorrect`.

**Open-rec duplication — top 5 `(asset_id, direction)` groupings among open recs:**

| Rank | asset_id | symbol | direction | open count |
|---|---|---|---|---|
| 1 | `NULL` | — | LONG | **937** |
| 2 | 8 | FED-CUT | YES | **428** |
| 3 | 1 | BTC | YES | **420** |
| 4 | 6 | GLD | LONG | **401** |
| 5 | `NULL` | — | WATCH | **389** |

Two observations from this table:
- **Rows 1 and 5 have `asset_id = NULL`.** 937 + 389 = 1 326 open recs are not tied to a tracked asset. That is roughly 22 % of the open pool.
- **Rows 2, 3, 4** show triple-digit open counts for the same `(asset, direction)` pair — the textbook scan-duplication symptom described in James's 2026-05-12 note.

**Live-trades sanity (Signal Tracker source):** `live_trades` table has **63 rows total**, **61 filled**, **2 rejected**. (Paper-return roll-up was not part of this query — paper return lives in `recommendations.paper_return`, not aggregated here.)

**Schema changes since 2026-05-12 (`ab4bf71`):**

```
lib/db/src/schema/coach_messages.ts | 37 +++++++++++++++++++++++++++++++++++++
lib/db/src/schema/index.ts          |  1 +
```

- **One new file: `lib/db/src/schema/coach_messages.ts`**, added in commit `b32d1f7` on **2026-05-20 07:51 UTC** ("Add persistent chat history…"). The corresponding `coach_messages` table is present in the live DB (visible in `information_schema.tables`).
- No other schema/migration files were added or modified in the window. No columns dropped or renamed on existing tables.

---

## 7. POST_UAT_POLISH.md

**Exists:** yes, at repo root. **Last touched by git:** commit `ab4bf71` on 2026-05-12 (the Edge Calc merge added the "Scanner conviction display — descoped" section). **No commits since 2026-05-12 modify this file** — its content is identical to what James last saw.

**Section titles (in order):**

1. `# Post-UAT Polish`
2. `## Trading → History filter chips`
3. `## Scanner conviction display — descoped`

**New sections added in the last 2 weeks:** **none.** No agent has appended new "things we wanted to do" items to this file during James's absence.

---

## 8. Delta Summary — what changed while James was away

Plain English, no fixes proposed.

- **The "Option B" revert never happened.** `ab4bf71` (Edge Calc R1+R2) is still on `main` and there is no revert commit. The state James left on 2026-05-12 with that decision pending is still the state today, just buried under 38 more commits.
- **`main` moved 38 commits forward** between 2026-05-12 and 2026-05-25 (HEAD `ae09a47`). 17 of those commits landed on or after 2026-05-18, which was the UAT freeze start date.
- **None of those 38 commits are merges from Project Tasks** — they are all direct agent commits to `main`. The "no Project Tasks without approval" rule from James's last session was upheld; the "codebase frozen during UAT" rule was not (no Project Task merges, but plenty of direct edits).
- **Project Task #2 is no longer hanging** — it was moved to CANCELLED on 2026-05-18 08:17 UTC. No new Project Tasks were created in the two-week window.
- **One new DB table (`coach_messages`)** and corresponding schema file landed during the freeze window on 2026-05-20.
- **`SCAN_DEDUP_INVESTIGATION.md` was never produced**, and **no deduplication code was added** to the api-server. The DB shows the duplication is now severe: 937 open recs with no `asset_id`, plus three triple-digit `(asset, direction)` clusters on FED-CUT / BTC / GLD.
- **Recommendation volume nearly doubled** (4 914 → 6 262) and the **open backlog grew to 6 097 rows**, with ~22 % of opens having `asset_id = NULL`.
- **Signal Tracker win rate dropped from 34.7 % → 10.30 %** (17 correct of 165 resolved). The resolved set grew, and the new resolutions came in overwhelmingly as `incorrect` (142 of 165).
- **No UAT artifacts exist in the repo** — no bug reports, no test exports, no tester-seeded data, no commits referencing bugs #28 / #29 / #30 by number. The status of those three bugs cannot be determined from inside this Repl.
- **`POST_UAT_POLISH.md` is unchanged** since `ab4bf71` — no new "wanted to do this" items were appended by intervening agents.
- **Local api-server is healthy** (HTTP 200 on `/api/healthz`, port 8080). **Railway and Vercel production states are not visible from inside Replit** — verify manually via the dashboard steps in §2.

**Open decisions from 2 weeks ago that are still open:**

1. Whether to revert `ab4bf71` (Edge Calc R1+R2) per the Option B recommendation, or accept that it is now part of the codebase.
2. Which deploy option (A / B / C from `UAT_BUILD_DECISION.md`) to actually execute against Railway + Vercel.
3. Whether to confirm/redeploy production at all — both prod surfaces may still be on their 2026-05-12 SHAs.
4. Whether to act on the scan-dedup signal (now significantly worse than 2 weeks ago) and produce `SCAN_DEDUP_INVESTIGATION.md`.
5. The status of UAT itself — whether it ran, was postponed, or was cancelled — is undetermined from repo state.
