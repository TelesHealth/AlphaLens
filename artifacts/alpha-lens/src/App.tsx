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

import { AuthProvider, useAuth } from "@/hooks/use-auth";

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
  // Public marketing page — accessible without authentication.
  // When the visitor is already signed in, wrap in Layout so the side
  // navigation stays available (Track Record is reachable from the sidebar).
  if (location === "/leaderboard") {
    if (user) {
      return (
        <Layout>
          <LeaderboardPage />
        </Layout>
      );
    }
    return <LeaderboardPage />;
  }

  return (
    <AuthGate>
      <Layout>
        <Switch>
          <Route path="/" component={Scanner} />
          <Route path="/market/:id" component={MarketDetail} />
          <Route path="/portfolio" component={Portfolio} />
          <Route path="/coach" component={Coach} />
          <Route path="/briefing" component={Briefing} />
          <Route path="/radar" component={Radar} />
          <Route path="/whales" component={Whales} />
          <Route path="/trading" component={TradingPage} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
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
