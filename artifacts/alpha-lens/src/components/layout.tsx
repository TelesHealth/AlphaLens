import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  Activity, 
  Briefcase, 
  MessageSquare, 
  Zap,
  Radio,
  Fish,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/briefing", label: "Briefing", icon: Zap },
    { href: "/", label: "Scanner", icon: Activity },
    { href: "/coach", label: "AI Coach", icon: MessageSquare },
    { href: "/portfolio", label: "Portfolio", icon: Briefcase },
    { href: "/radar", label: "Radar", icon: Radio },
    { href: "/whales", label: "Smart Money", icon: Fish },
  ];

  const SidebarContent = () => (
    <>
      <div className="p-6 mb-4 flex items-center gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
          <span className="font-display font-bold text-xl text-primary text-glow-primary leading-none">A</span>
        </div>
        <span className="font-display font-bold text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
          ARCLION
        </span>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = item.href === "/"
            ? (location === "/" || location.startsWith("/market"))
            : (location === item.href || (item.href !== "/" && location.startsWith(item.href)));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-200 group relative overflow-hidden",
                isActive 
                  ? "text-primary bg-primary/10 border border-primary/20 shadow-[inset_0px_0px_12px_rgba(59,130,246,0.1)]" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              )}
              <Icon className={cn("w-5 h-5 transition-transform duration-200", isActive ? "scale-110 text-primary text-glow-primary" : "group-hover:scale-110")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto">
        <div className="rounded-xl bg-card border border-border p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse" />
            <span className="text-xs font-mono text-muted-foreground">SYSTEM STATUS</span>
          </div>
          <div className="text-sm font-medium">All engines nominal</div>
          <div className="text-xs text-muted-foreground mt-1 font-mono">v1.0.4-beta</div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-72 border-r border-border/50 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 fixed inset-y-0 z-50">
        <SidebarContent />
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 border-b border-border/50 bg-background/95 backdrop-blur-xl z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="font-display font-bold text-base text-primary text-glow-primary leading-none">A</span>
          </div>
          <span className="font-display font-bold text-lg">ARCLION</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 -mr-2 text-muted-foreground hover:text-foreground"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-16 bg-background z-40 flex flex-col border-t border-border/50">
          <SidebarContent />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-72 pt-16 md:pt-0 min-h-screen relative flex flex-col">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-8 lg:p-10 z-10">
          {children}
        </div>
      </main>
    </div>
  );
}
