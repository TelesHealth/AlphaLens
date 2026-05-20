import { useState, FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function Login() {
  const [, navigate] = useLocation();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // P4-2: Distinguish between (a) network/transport failures — where
    // fetch() rejects with TypeError "Failed to fetch" or AbortError — and
    // (b) server-returned errors (4xx/5xx with a JSON body). The previous
    // implementation surfaced the raw browser error string to the user,
    // which made transient connectivity issues read as if the credentials
    // were wrong. We now show a clear, actionable message in each case and
    // log the underlying error to the browser console for debugging.
    try {
      let res: Response;
      try {
        res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/auth/login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password }),
          },
        );
      } catch (networkErr) {
        console.error("[login] network error", networkErr);
        setError(
          "Unable to reach the server. Please check your connection and try again.",
        );
        return;
      }

      let data: { error?: string; user?: unknown } | null = null;
      try {
        data = await res.json();
      } catch {
        // Body wasn't JSON — could be a proxy/HTML error page during a
        // deploy or cold start. Surface a friendly message instead of the
        // raw parser error.
        if (!res.ok) {
          setError(
            res.status >= 500
              ? "The server hit an unexpected error. Please try again in a moment."
              : "Login failed. Please try again.",
          );
          return;
        }
      }
      if (!res.ok) {
        // 401/403 → bad credentials; 4xx → validation; 5xx → server error.
        if (res.status === 401 || res.status === 403) {
          setError(data?.error ?? "Invalid email or password.");
        } else if (res.status >= 500) {
          setError(
            "The server hit an unexpected error. Please try again in a moment.",
          );
        } else {
          setError(data?.error ?? "Login failed. Please try again.");
        }
        return;
      }
      await refresh();
      navigate("/briefing");
    } catch (err) {
      // Last-resort catch — should be unreachable now that fetch errors are
      // handled above, but kept so we never let an unhandled rejection
      // surface as a stack trace in the UI.
      console.error("[login] unexpected error", err);
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="font-bold text-xl text-primary">A</span>
          </div>
          <span className="font-display font-bold text-xl tracking-wider">ARCLION</span>
        </div>
        <h1 className="text-2xl font-bold mb-2">Sign in</h1>
        <p className="text-sm text-muted-foreground mb-6">Welcome back. Enter your credentials to continue.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 pr-16 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-sm text-muted-foreground mt-6 text-center">
          No account?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
