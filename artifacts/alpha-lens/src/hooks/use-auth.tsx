import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt?: string;
  lastLoginAt?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  // Tracks the previously authenticated user id so we can detect a real auth
  // identity change. Starts null; the `!= null` guard below ensures we never
  // clear on the harmless null → user transition (initial load / first login,
  // where there is no prior user's data to leak).
  const prevUserIdRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
        credentials: "include",
      });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data?.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // P3-33 / P3-32 / P3-15: per-user data isolation. The backend already scopes
  // every paper-trade and coach-history query to req.user, but React Query's
  // cache lives in the browser tab and survives a logout/login. Without this,
  // user B briefly sees user A's cached portfolio / pending orders / coach
  // thread until each query refetches. On any real identity change — logout
  // (id → null) or account switch (idA → idB) — we wipe the entire query cache
  // so the next session can only ever read freshly fetched, server-scoped data.
  // We intentionally skip the null → id transition (no prior user = nothing to
  // leak), which also avoids an unnecessary refetch storm on initial load.
  useEffect(() => {
    const prev = prevUserIdRef.current;
    const current = user?.id ?? null;
    if (prev != null && prev !== current) {
      queryClient.clear();
    }
    prevUserIdRef.current = current;
  }, [user?.id, queryClient]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
