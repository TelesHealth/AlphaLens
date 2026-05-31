import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useCoachAnalyze,
  useListCoachMessages,
  getListCoachMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export type CoachMessage = {
  id: string;
  role: "user" | "coach";
  content: string;
  recommendations?: string[];
  riskAssessment?: string | null;
  confidence?: number;
};

const COACH_STORAGE_PREFIX = "aiCoach.messages";

// sessionStorage is keyed PER USER. A single global key used to leak one
// account's chat into the next account that signed in on the same browser
// (the CoachProvider unmounts on logout before any cleanup effect can run, so
// a shared key was never cleared). Scoping by userId makes cross-user leakage
// structurally impossible — a brand-new account simply has no key and starts
// empty, and each user only ever reads their own cache.
function storageKey(userId: number | null): string {
  return `${COACH_STORAGE_PREFIX}.${userId ?? "anon"}`;
}

export const COACH_WELCOME_MESSAGE: CoachMessage = {
  id: "welcome",
  role: "coach",
  content:
    "I'm Arclion, your AI investment coach. I analyze global market data, evidence signals, and structural shifts. How can I assist your portfolio today?",
};

function loadCoachMessages(userId: number | null): CoachMessage[] {
  if (typeof window === "undefined") return [COACH_WELCOME_MESSAGE];
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId));
    if (!raw) return [COACH_WELCOME_MESSAGE];
    const parsed = JSON.parse(raw) as CoachMessage[];
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : [COACH_WELCOME_MESSAGE];
  } catch {
    return [COACH_WELCOME_MESSAGE];
  }
}

type CoachContextValue = {
  messages: CoachMessage[];
  ask: (question: string, assetId?: number) => void;
  isPending: boolean;
};

const CoachContext = createContext<CoachContextValue | null>(null);

// CoachProvider is mounted ABOVE the routed pages so the in-flight analyze
// mutation and the messages state survive when the user navigates away from
// /coach and back.
//
// Server-side persistence is the source of truth. When the user is
// authenticated we fetch their chat history from /coach/messages and merge it
// into the thread. The /coach/analyze route saves both the user question and
// the coach reply server-side, so a logout/login round-trip restores the full
// thread. sessionStorage is only a per-user paint cache for instant render
// before the server history arrives.
export function CoachProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<CoachMessage[]>(() =>
    loadCoachMessages(userId),
  );
  const analyzeMutation = useCoachAnalyze();

  // Mirrors `userId` so async mutation callbacks can read the CURRENT auth
  // context without going stale in their captured closure. Used to drop
  // /analyze responses that arrive after the user logged out or switched
  // accounts — otherwise user A's coach reply could land in user B's chat.
  const currentUserIdRef = useRef<number | null>(userId);
  currentUserIdRef.current = userId;
  // Tracks the previous userId so we can detect a real auth transition.
  const prevUserIdRef = useRef<number | null>(userId);
  // Messages produced in THIS browser session via ask() (optimistic question
  // + the coach reply/error). Tracked separately from `messages` so that when
  // server history finally loads we can rebuild the thread as
  // [welcome, ...serverHistory, ...sessionMessages] without dropping anything
  // the user just typed and without duplicating the cached paint.
  const sessionMsgsRef = useRef<CoachMessage[]>([]);
  // Whether the user has sent anything this session. Decides replace-vs-merge
  // when server history arrives.
  const hasSessionActivityRef = useRef(false);
  // Whether server history has been merged in for the current login. We merge
  // exactly once; afterwards the in-memory thread is authoritative and ask()
  // keeps both it and the server in sync. Crucially this is set AFTER the
  // merge actually happens, so a message sent before history loads can never
  // permanently skip restoration (the architect's race): the merge still runs
  // once data arrives and prepends the restored history ahead of the live
  // session messages.
  const serverMergedRef = useRef(false);

  // Pull server-side history whenever a user is signed in. `enabled` keeps the
  // request suspended for anonymous sessions so we don't fire a 401 on every
  // page load. SECURITY: scope the query key by `userId` so cached coach
  // history can never leak between two accounts on the same browser.
  const historyQuery = useListCoachMessages({
    query: {
      queryKey: [...getListCoachMessagesQueryKey(), { userId: userId ?? "anon" }],
      enabled: userId != null,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  // Merge server history into the thread once per login (and reset everything
  // on a real auth transition).
  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    // Real auth transition (logout -> null, or account switch A -> B): drop
    // all per-session state and the previous account's cached query rows.
    if (prevUserId !== userId) {
      setMessages(loadCoachMessages(userId));
      sessionMsgsRef.current = [];
      hasSessionActivityRef.current = false;
      serverMergedRef.current = false;
      queryClient.removeQueries({
        queryKey: getListCoachMessagesQueryKey(),
      });
    }

    if (userId == null) return;
    if (serverMergedRef.current) return;
    if (!historyQuery.data) return;

    const rows = historyQuery.data.messages ?? [];
    const serverMsgs: CoachMessage[] = rows.map((row: typeof rows[number]) => ({
      id: `srv-${row.id}`,
      role: row.role === "user" ? "user" : "coach",
      content: row.content,
      recommendations: row.recommendations ?? undefined,
      riskAssessment: row.riskAssessment ?? null,
      confidence:
        typeof row.confidence === "number" ? row.confidence : undefined,
    }));

    // Restored history goes first (it's older); anything the user already sent
    // this session stays after it. With no session activity this is a plain
    // replace, which also discards the transient sessionStorage paint in favor
    // of the authoritative server thread.
    setMessages([
      COACH_WELCOME_MESSAGE,
      ...serverMsgs,
      ...(hasSessionActivityRef.current ? sessionMsgsRef.current : []),
    ]);
    serverMergedRef.current = true;
  }, [userId, historyQuery.data, queryClient]);

  // Persist the current thread to the per-user session cache for instant paint
  // on the next mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        storageKey(userId),
        JSON.stringify(messages),
      );
    } catch {
      // ignore
    }
  }, [messages, userId]);

  const appendMessage = (msg: CoachMessage) => {
    sessionMsgsRef.current = [...sessionMsgsRef.current, msg];
    setMessages((prev) => [...prev, msg]);
  };

  const ask = (question: string, assetId?: number) => {
    const trimmed = question.trim();
    if (!trimmed || analyzeMutation.isPending) return;
    hasSessionActivityRef.current = true;
    // Snapshot the auth context AT THE MOMENT the question is asked. If it
    // changes before the response lands (logout / account switch), we discard
    // the result so it can't leak into the next session.
    const askedAsUserId = currentUserIdRef.current;
    appendMessage({
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
    });
    analyzeMutation.mutate(
      {
        data: {
          question: trimmed,
          assetId: assetId ?? undefined,
        },
      },
      {
        onSuccess: (res) => {
          if (currentUserIdRef.current !== askedAsUserId) return;
          appendMessage({
            id: (Date.now() + 1).toString(),
            role: "coach",
            content: res.analysis,
            recommendations: res.recommendations,
            riskAssessment: res.riskAssessment,
            confidence: res.confidence,
          });
          // The server has now persisted this exchange; refresh the cached
          // history so a later remount/login hydrates the full thread.
          if (askedAsUserId != null) {
            queryClient.invalidateQueries({
              queryKey: getListCoachMessagesQueryKey(),
            });
          }
        },
        onError: () => {
          if (currentUserIdRef.current !== askedAsUserId) return;
          appendMessage({
            id: (Date.now() + 1).toString(),
            role: "coach",
            content:
              "I encountered an error analyzing the data. Please check connection and try again.",
          });
        },
      },
    );
  };

  return (
    <CoachContext.Provider
      value={{
        messages,
        ask,
        isPending: analyzeMutation.isPending,
      }}
    >
      {children}
    </CoachContext.Provider>
  );
}

export function useCoach(): CoachContextValue {
  const ctx = useContext(CoachContext);
  if (!ctx) {
    throw new Error("useCoach must be used within a CoachProvider");
  }
  return ctx;
}
