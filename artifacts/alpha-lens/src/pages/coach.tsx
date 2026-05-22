import { useState, useRef, useEffect } from "react";
import { useListMarkets } from "@workspace/api-client-react";
import { Send, Bot, User, BrainCircuit, AlertTriangle, ChevronRight, Zap, Sparkles } from "lucide-react";
import { cn } from "@/components/ui-helpers";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCoach } from "@/context/coach-context";
import { consumeAskCoachPrefill } from "@/lib/ask-coach";

// Curated starter questions shown when the conversation is empty. Grouped
// by intent so users get a flavor of what the coach is best at.
const STARTER_QUESTIONS: { group: string; questions: string[] }[] = [
  {
    group: "Market regime",
    questions: [
      "What's the current market regime — risk-on or risk-off?",
      "Which sectors look strongest this week and why?",
      "How are macro signals (Fed, CPI, unemployment) shaping risk appetite?",
      "Where is the smart money flowing right now?",
    ],
  },
  {
    group: "Trade ideas & sizing",
    questions: [
      "What are the highest-conviction trade calls on the board today?",
      "How should I size my first paper trade?",
      "Which prediction market shows the biggest AI vs market edge?",
      "Walk me through a high-edge crypto setup right now.",
    ],
  },
  {
    group: "Learn the platform",
    questions: [
      "Explain how to read the conviction score on a recommendation.",
      "What's the difference between AI Confidence and Conviction?",
      "How does Alpha Lens generate its AI probability scores?",
      "What does the Alpha Score actually measure?",
    ],
  },
];

// Pregenerated follow-up questions shown AFTER each coach reply so the
// user always has a useful next prompt one click away. We rotate through
// the pool deterministically based on message id so the suggestions don't
// reshuffle on every re-render.
const FOLLOWUP_POOL: string[] = [
  "What's the strongest counter-argument to this view?",
  "How should I size a position around this idea?",
  "What would invalidate this thesis — what should I watch?",
  "How does this compare to similar setups in the past 12 months?",
  "What's the best entry trigger and where should the stop sit?",
  "Are there any related markets that would amplify this trade?",
  "How does this fit into the current macro regime?",
  "What's the risk/reward asymmetry here?",
  "Which signals should I monitor over the next 48 hours?",
  "If this thesis works, what's the realistic upside path?",
];

function pickFollowups(seed: string | number, count = 3): string[] {
  // Simple deterministic hash → rotating window into FOLLOWUP_POOL.
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const start = h % FOLLOWUP_POOL.length;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(FOLLOWUP_POOL[(start + i) % FOLLOWUP_POOL.length]);
  }
  return out;
}

export default function Coach() {
  const [input, setInput] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<number | "">("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: marketsData } = useListMarkets({ limit: 100 });

  // Bug #11: messages, mutation, and isPending all live in CoachProvider so
  // they survive when the user navigates away from /coach mid-request.
  const { messages, ask, isPending } = useCoach();

  // Bug #12: when the user clicks an "Ask Coach" button elsewhere in the app,
  // we stash the question (and optional asset context) in sessionStorage and
  // navigate here. On mount, consume that prefill and auto-submit so the user
  // sees an immediate response without re-typing.
  const prefillHandled = useRef(false);
  useEffect(() => {
    if (prefillHandled.current) return;
    const prefill = consumeAskCoachPrefill();
    if (!prefill) return;
    prefillHandled.current = true;
    if (prefill.assetId != null) setSelectedAssetId(prefill.assetId);
    // Defer one tick so React commits the asset-select change before the
    // mutation reads context.
    setTimeout(() => {
      ask(prefill.question, prefill.assetId);
    }, 0);
  }, [ask]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isPending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isPending) return;
    const q = input;
    setInput("");
    ask(q, selectedAssetId === "" ? undefined : Number(selectedAssetId));
  };

  // One-click submit for a pregenerated question (starter or follow-up).
  // Skips the input box so the user goes straight from idea → reply.
  const submitQuestion = (q: string) => {
    if (isPending || !q.trim()) return;
    ask(q, selectedAssetId === "" ? undefined : Number(selectedAssetId));
  };

  // Index of the latest coach message — that's the only one we attach
  // follow-up suggestions to (the older replies stay clean to avoid
  // visual clutter in the scroll history).
  let lastCoachIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "coach") { lastCoachIdx = i; break; }
  }

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
          {messages.map((msg, idx) => (
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

                  {/* Pregenerated related questions — only attached to the
                      LATEST coach reply so the user always has a relevant
                      next prompt one click away without scrolling. */}
                  {msg.role === "coach" && idx === lastCoachIdx && !isPending && (
                    <div className="bg-background/60 border border-border rounded-xl p-4 backdrop-blur-sm">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-primary" />
                        Related questions
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {pickFollowups(msg.id).map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => submitQuestion(q)}
                            className="text-xs font-mono px-3 py-1.5 rounded-full border border-border bg-card hover:bg-secondary hover:border-primary/40 hover:text-foreground text-muted-foreground transition-colors text-left"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isPending && (
            <div className="flex w-full justify-start">
              <div className="flex gap-4 max-w-[85%]">
                <div className="w-10 h-10 rounded-xl bg-secondary border border-border text-foreground flex items-center justify-center shrink-0">
                  <BrainCircuit className="w-5 h-5 animate-pulse text-primary" />
                </div>
                <div
                  className="p-5 rounded-2xl bg-background border border-border rounded-tl-sm flex items-center gap-2"
                  role="status"
                  aria-live="polite"
                  aria-label="AI Coach is generating a response"
                  data-testid="coach-pending-indicator"
                >
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="ml-3 text-xs font-mono text-muted-foreground">
                    Thinking…
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background/50 border-t border-border backdrop-blur-md z-10">
          {messages.length <= 1 && !isPending && (
            <div className="max-w-4xl mx-auto mb-3 space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary" />
                Suggested starter questions
              </div>
              {STARTER_QUESTIONS.map(({ group, questions }) => (
                <div key={group}>
                  <div className="text-[10px] font-mono text-muted-foreground/70 mb-1.5 pl-1">
                    {group}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {questions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => submitQuestion(q)}
                        className="text-xs font-mono px-3 py-1.5 rounded-full border border-border bg-card hover:bg-secondary hover:border-primary/40 hover:text-foreground text-muted-foreground transition-colors text-left"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleSubmit} className="relative flex items-center max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={selectedAssetId ? "Ask about this specific market..." : "Ask for structural market analysis..."}
              className="w-full bg-card border-2 border-border rounded-xl pl-4 pr-14 py-4 text-base focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-inner"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={!input.trim() || isPending}
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
