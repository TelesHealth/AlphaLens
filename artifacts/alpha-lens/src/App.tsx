import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { ReactNode, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";


import Scanner from "@/pages/scanner";
import MarketDetail from "@/pages/market-detail";
import Portfolio from "@/pages/portfolio";
import Coach from "@/pages/coach";
import Briefing from "@/pages/briefing";
import Radar from "@/pages/radar";
import Whales from "@/pages/whales";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Settings from "@/pages/settings";
import TradingPage from "@/pages/trading";
import LeaderboardPage from "@/pages/leaderboard";
import WatchlistPage from "@/pages/watchlist";

import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { CoachProvider } from "@/context/coach-context";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 mins
    },
  },
});

function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user && location !== "/login" && location !== "/register") {
      navigate("/login");
    }
  }, [user, loading, location, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}

function Router() {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (location === "/login") {
    if (!loading && user) return <Redirect to="/briefing" />;
    return <Login />;
  }
  if (location === "/register") {
    if (!loading && user) return <Redirect to="/briefing" />;
    return <Register />;
  }
  // /leaderboard is the only route accessible without authentication. For
  // signed-out visitors we render it bare (no Layout / no CoachProvider).
  if (location === "/leaderboard" && !user && !loading) {
    return <LeaderboardPage />;
  }

  // Single CoachProvider for ALL authenticated routes — including
  // /leaderboard. Previously each branch instantiated its own provider, so
  // navigating /coach → /leaderboard unmounted the in-flight mutation and
  // wiped messages back to sessionStorage. One shared instance keeps the
  // mutation alive and the messages identical across navigation. The Layout
  // is also shared so the chrome doesn't remount (which would briefly drop
  // the sidebar and trigger duplicate auth/data fetches).
  return (
    <AuthGate>
      <CoachProvider>
        <Layout>
          <Switch>
            <Route path="/" component={Scanner} />
            <Route path="/market/:id" component={MarketDetail} />
            <Route path="/portfolio" component={Portfolio} />
            <Route path="/watchlist" component={WatchlistPage} />
            <Route path="/coach" component={Coach} />
            <Route path="/briefing" component={Briefing} />
            <Route path="/radar" component={Radar} />
            <Route path="/whales" component={Whales} />
            <Route path="/trading" component={TradingPage} />
            <Route path="/leaderboard" component={LeaderboardPage} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </CoachProvider>
    </AuthGate>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
