import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  useCoachAnalyze,
  useListCoachMessages,
  getListCoachMessagesQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";

export type CoachMessage = {
  id: string;
  role: "user" | "coach";
  content: string;
  recommendations?: string[];
  riskAssessment?: string | null;
  confidence?: number;
};

const COACH_STORAGE_KEY = "aiCoach.messages";

export const COACH_WELCOME_MESSAGE: CoachMessage = {
  id: "welcome",
  role: "coach",
  content:
    "I'm Arclion, your AI investment coach. I analyze global market data, evidence signals, and structural shifts. How can I assist your portfolio today?",
};

function loadCoachMessages(): CoachMessage[] {
  if (typeof window === "undefined") return [COACH_WELCOME_MESSAGE];
  try {
    const raw = window.sessionStorage.getItem(COACH_STORAGE_KEY);
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
  setMessages: Dispatch<SetStateAction<CoachMessage[]>>;
  ask: (question: string, assetId?: number) => void;
  isPending: boolean;
};

const CoachContext = createContext<CoachContextValue | null>(null);

// CoachProvider is mounted ABOVE the routed pages so the in-flight analyze
// mutation and the messages state survive when the user navigates away from
// /coach and back (UAT bug #11).
//
// P3-15: Server-side persistence. When the user is authenticated we fetch
// their chat history from /coach/messages and replace the local state. The
// /coach/analyze route saves both the user question and the coach reply
// server-side, so a logout/login round-trip restores the full thread.
// Anonymous users continue to use sessionStorage as a best-effort cache.
export function CoachProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [messages, setMessages] = useState<CoachMessage[]>(loadCoachMessages);
  const analyzeMutation = useCoachAnalyze();
  const lastHydratedUserIdRef = useRef<number | null>(null);

  // Pull server-side history whenever a user is signed in. `enabled` keeps
  // the request suspended for anonymous sessions so we don't fire a 401 on
  // every page load.
  const historyQuery = useListCoachMessages({
    query: {
      queryKey: getListCoachMessagesQueryKey(),
      enabled: userId != null,
      staleTime: 30_000,
      // Don't refetch on focus — incoming /analyze responses already update
      // the in-memory state and a refetch would briefly flicker the thread.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  // Rehydrate when the user changes (login, account switch). For the same
  // userId we only hydrate once — subsequent /analyze appends are managed
  // optimistically in `ask` below.
  //
  // Race-condition guard: if the user already started chatting in this
  // session (messages contains anything beyond the welcome bubble), DO NOT
  // replace state — the optimistic user question and the in-flight coach
  // reply must not be clobbered by the slower history fetch. The next
  // mount/login will hydrate cleanly.
  useEffect(() => {
    if (userId == null) {
      lastHydratedUserIdRef.current = null;
      return;
    }
    if (lastHydratedUserIdRef.current === userId) return;
    if (analyzeMutation.isPending) return;
    if (!historyQuery.data) return;

    const hasLocalActivity =
      messages.length > 1 ||
      (messages.length === 1 && messages[0].id !== COACH_WELCOME_MESSAGE.id);
    if (hasLocalActivity) {
      // Mark this user as hydrated anyway so we don't keep re-triggering;
      // local state already reflects fresher activity than the server cache.
      lastHydratedUserIdRef.current = userId;
      return;
    }

    const rows = historyQuery.data.messages ?? [];
    if (rows.length === 0) {
      setMessages([COACH_WELCOME_MESSAGE]);
    } else {
      const restored: CoachMessage[] = rows.map((row: typeof rows[number]) => ({
        id: `srv-${row.id}`,
        role: row.role === "user" ? "user" : "coach",
        content: row.content,
        recommendations: row.recommendations ?? undefined,
        riskAssessment: row.riskAssessment ?? null,
        confidence:
          typeof row.confidence === "number" ? row.confidence : undefined,
      }));
      setMessages([COACH_WELCOME_MESSAGE, ...restored]);
    }
    lastHydratedUserIdRef.current = userId;
  }, [userId, historyQuery.data, analyzeMutation.isPending, messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        COACH_STORAGE_KEY,
        JSON.stringify(messages),
      );
    } catch {
      // ignore
    }
  }, [messages]);

  const ask = (question: string, assetId?: number) => {
    const trimmed = question.trim();
    if (!trimmed || analyzeMutation.isPending) return;
    const userMsg: CoachMessage = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    analyzeMutation.mutate(
      {
        data: {
          question: trimmed,
          assetId: assetId ?? undefined,
        },
      },
      {
        onSuccess: (res) => {
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: "coach",
              content: res.analysis,
              recommendations: res.recommendations,
              riskAssessment: res.riskAssessment,
              confidence: res.confidence,
            },
          ]);
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: "coach",
              content:
                "I encountered an error analyzing the data. Please check connection and try again.",
            },
          ]);
        },
      },
    );
  };

  return (
    <CoachContext.Provider
      value={{
        messages,
        setMessages,
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
