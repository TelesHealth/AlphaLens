# Post-UAT Polish

Small UX/copy items to address after the Monday UAT cycle. Not blockers.

## Trading → History filter chips

In `artifacts/alpha-lens/src/pages/trading.tsx`, rename the History tab filter
chips to reduce confusion observed during pre-UAT investigation:

- `filled` → `executed`
- `rejected` → `cancelled`

Affects the `HistoryFilter` union type, the `filters` array, the chip render,
and the per-row status badge text. The underlying `live_trades.status` values
in the database stay as-is (`filled` / `rejected`) — only the user-facing
labels change.

Context: a tester reported "rejected trade missing from History" during a
session where they had a platform filter (e.g. `paper`) selected instead of
`all`. The rejected row was in the response but filtered out by platform.
Clearer chip labels would have made this self-evident.
