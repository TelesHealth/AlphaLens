const PREFILL_KEY = "aiCoach.pendingPrefill";

export type AskCoachPrefill = {
  question: string;
  assetId?: number;
};

export function setAskCoachPrefill(question: string, assetId?: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PREFILL_KEY,
      JSON.stringify({ question, assetId } satisfies AskCoachPrefill),
    );
  } catch {
    // sessionStorage unavailable (private mode / quota) — fail silent.
  }
}

export function consumeAskCoachPrefill(): AskCoachPrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PREFILL_KEY);
    const parsed = JSON.parse(raw) as AskCoachPrefill;
    if (!parsed || typeof parsed.question !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
