---
name: AI Coach chat persistence
description: How coach chat state is scoped/restored across logins; why per-user scoping + merge-once hydration matter.
---
# AI Coach chat persistence (alpha-lens coach-context.tsx)

The coach thread has two layers: the server (`/coach/messages`, source of truth — `/coach/analyze` saves BOTH the user question and coach reply) and an in-memory React thread with a sessionStorage paint cache.

## Rules / decisions
- **Scope sessionStorage AND the React Query history key by userId.** A single global key (or unscoped query key) leaks one account's chat into the next account on the same browser. The CoachProvider unmounts on logout (AuthGate returns null when `!user`) BEFORE any cleanup effect runs, so logout-time clears never fire — per-user keys are the only reliable isolation.
- **Hydrate server history with a merge-once that ALWAYS runs.** Do NOT gate hydration on "cache present" / "has local activity" — that was the bug: a stale paint cache looked like activity and permanently blocked restoration, so previous chats never came back. Instead merge exactly once per login as `[welcome, ...serverHistory, ...sessionMessages]`. Track session messages (added via ask()) in a ref so a message sent BEFORE history loads is preserved and history is still prepended once it arrives (race-safe).
- **Drop late /analyze responses when auth identity changed.** Snapshot userId at ask() time; in onSuccess/onError bail if `currentUserIdRef.current !== askedAsUserId`, else user A's reply lands in user B's thread.

**Why:** non-technical user James reported: new account showed leftover chat, same chat reappeared after re-login, and saved chats never restored — all three traced to the unscoped key + activity-gated hydration above.
