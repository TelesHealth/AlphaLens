import { useState, useRef, useEffect } from "react";
import { useCoachAnalyze, useListMarkets } from "@workspace/api-client-react";
import { Send, Bot, User, BrainCircuit, AlertTriangle, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/components/ui-helpers";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: string;
  role: "user" | "coach";
  content: string;
  recommendations?: string[];
  riskAssessment?: string | null;
  confidence?: number;
};

const COACH_STORAGE_KEY = "aiCoach.messages";

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "coach",
  content:
    "I'm Arclion, your AI investment coach. I analyze global market data, evidence signals, and structural shifts. How can I assist your portfolio today?",
};

// Hydrate chat messages from sessionStorage so navigation away from /coach
// (which unmounts this route component) does not wipe the user's conversation.
// SessionStorage scope = current browser tab/session, so a new browser session
// resets — matching the bug spec's "duration of the browser session" rule.
function loadCoachMessages(): Message[] {
  if (typeof window === "undefined") return [WELCOME_MESSAGE];
  try {
    const raw = window.sessionStorage.getItem(COACH_STORAGE_KEY);
    if (!raw) return [WELCOME_MESSAGE];
    const parsed = JSON.parse(raw) as Message[];
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : [WELCOME_MESSAGE];
  } catch {
    return [WELCOME_MESSAGE];
  }
}

export default function Coach() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>(loadCoachMessages);
  const [selectedAssetId, setSelectedAssetId] = useState<number | "">("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { data: marketsData } = useListMarkets({ limit: 100 });
  const analyzeMutation = useCoachAnalyze();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, analyzeMutation.isPending]);

  // Persist messages to sessionStorage on every change so navigation away from
  // /coach (which unmounts this component) does not lose the conversation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        COACH_STORAGE_KEY,
        JSON.stringify(messages),
      );
    } catch {
      // sessionStorage may be unavailable (private mode, quota exceeded). The
      // chat still works in-memory; we just can't survive navigation in that
      // edge case. No user-facing error needed.
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || analyzeMutation.isPending) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    analyzeMutation.mutate({
      data: {
        question: userMsg.content,
        assetId: selectedAssetId === "" ? undefined : Number(selectedAssetId)
      }
    }, {
      onSuccess: (res) => {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: "coach",
          content: res.analysis,
          recommendations: res.recommendations,
          riskAssessment: res.riskAssessment,
          confidence: res.confidence
        }]);
      },
      onError: () => {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: "coach",
          content: "I encountered an error analyzing the data. Please check connection and try again."
        }]);
      }
    });
  };

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-4rem)] flex flex-col animate-in fade-in duration-500">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display text-glow-primary flex items-center gap-3">
            <Bot className="w-8 h-8 text-primary" /> AI Coach
          </h1>
          <p className="text-muted-foreground mt-1">Deep analysis and actionable intelligence.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1.5 w-full sm:w-auto shadow-sm">
          <span className="text-xs font-mono text-muted-foreground px-2">CONTEXT:</span>
          <select 
            value={selectedAssetId}
            onChange={(e) => setSelectedAssetId(e.target.value === "" ? "" : Number(e.target.value))}
            className="bg-background border border-border rounded px-3 py-1.5 text-sm outline-none focus:border-primary/50 text-foreground min-w-[150px]"
          >
            <option value="">Global Macro</option>
            {marketsData?.markets.map(m => (
              <option key={m.id} value={m.id}>{m.symbol} - {m.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
        
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 z-10 scrollbar-thin">
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex w-full", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("flex gap-4 max-w-[85%]", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-sm", 
                  msg.role === "user" ? "bg-primary/20 border-primary/30 text-primary" : "bg-secondary border-border text-foreground"
                )}>
                  {msg.role === "user" ? <User className="w-5 h-5" /> : <BrainCircuit className="w-5 h-5" />}
                </div>

                <div className="space-y-3">
                  <div className={cn("p-4 md:p-5 rounded-2xl text-[15px] leading-relaxed", 
                    msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm shadow-[0_4px_20px_rgba(59,130,246,0.15)]" : "bg-background border border-border rounded-tl-sm shadow-md"
                  )}>
                    {msg.role === "coach" ? (
                      <div className="prose prose-sm prose-invert max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-lg [&>h2]:text-base [&>h3]:text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : msg.content}
                  </div>

                  {msg.role === "coach" && msg.recommendations && msg.recommendations.length > 0 && (
                    <div className="bg-background/80 border border-primary/20 rounded-xl p-4 shadow-sm backdrop-blur-sm">
                      <h4 className="text-xs font-mono font-bold text-primary tracking-widest mb-3 flex items-center gap-2">
                        <Zap className="w-3 h-3" /> ACTIONABLE RECOMMENDATIONS
                      </h4>
                      <ul className="space-y-2">
                        {msg.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <div className="text-foreground/90 prose prose-sm prose-invert max-w-none [&_p]:m-0 [&_strong]:text-foreground">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{rec}</ReactMarkdown>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {msg.role === "coach" && (msg.riskAssessment || msg.confidence) && (
                    <div className="flex flex-wrap gap-2">
                      {msg.riskAssessment && (
                        <div className="px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs font-mono flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Risk: {msg.riskAssessment}
                        </div>
                      )}
                      {msg.confidence && (
                        <div className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-muted-foreground text-xs font-mono">
                          Analysis Confidence: <span className="text-foreground font-bold">{msg.confidence}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {analyzeMutation.isPending && (
            <div className="flex w-full justify-start">
              <div className="flex gap-4 max-w-[85%]">
                <div className="w-10 h-10 rounded-xl bg-secondary border border-border text-foreground flex items-center justify-center shrink-0">
                  <BrainCircuit className="w-5 h-5 animate-pulse text-primary" />
                </div>
                <div className="p-5 rounded-2xl bg-background border border-border rounded-tl-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background/50 border-t border-border backdrop-blur-md z-10">
          <form onSubmit={handleSubmit} className="relative flex items-center max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={selectedAssetId ? "Ask about this specific market..." : "Ask for structural market analysis..."}
              className="w-full bg-card border-2 border-border rounded-xl pl-4 pr-14 py-4 text-base focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-inner"
              disabled={analyzeMutation.isPending}
            />
            <button
              type="submit"
              disabled={!input.trim() || analyzeMutation.isPending}
              className="absolute right-2 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary transition-colors shadow-lg shadow-primary/20"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

