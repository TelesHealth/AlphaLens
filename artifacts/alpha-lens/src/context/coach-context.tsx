import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useCoachAnalyze } from "@workspace/api-client-react";

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

// CoachProvider is mounted ABOVE the routed pages so that the in-flight
// analyze mutation and the messages state survive when the user navigates
// away from /coach and back. This satisfies bug #11 in the UAT brief.
export function CoachProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<CoachMessage[]>(loadCoachMessages);
  const analyzeMutation = useCoachAnalyze();

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
