import { useState, useEffect, FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  User as UserIcon,
  Plug,
  Plug2,
  CheckCircle2,
  Circle,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";

type Platform = "kalshi" | "alpaca" | "polymarket";

interface TradingAccount {
  id: number;
  platform: Platform;
  status: string;
  createdAt: string;
}

interface PlatformDef {
  id: Platform;
  name: string;
  description: string;
  note?: string;
  fields: { key: string; label: string; type: "text" | "password" | "email" }[];
}

const PLATFORMS: PlatformDef[] = [
  {
    id: "kalshi",
    name: "Kalshi",
    description: "CFTC-regulated U.S. prediction markets. Used as the primary live trading venue.",
    fields: [
      { key: "email", label: "Email", type: "email" },
      { key: "password", label: "Password", type: "password" },
    ],
  },
  {
    id: "alpaca",
    name: "Alpaca",
    description: "U.S. equities and ETFs (SPY, QQQ, GLD, etc.) via Alpaca's brokerage API.",
    fields: [
      { key: "apiKey", label: "API Key", type: "text" },
      { key: "secretKey", label: "Secret Key", type: "password" },
    ],
  },
  {
    id: "polymarket",
    name: "Polymarket",
    description: "On-chain prediction markets.",
    note: "Polymarket is only available outside the United States.",
    fields: [{ key: "privateKey", label: "Private Key", type: "password" }],
  },
];

export default function Settings() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<Platform | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<Platform | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function loadAccounts() {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/user/trading-accounts`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAccountsError(data?.error ?? "Failed to load trading accounts");
        return;
      }
      setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    } catch (err: any) {
      setAccountsError(err?.message ?? "Failed to load trading accounts");
    } finally {
      setAccountsLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New password and confirmation do not match");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(data?.error ?? "Failed to update password");
        return;
      }
      setPwSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwError(err?.message ?? "Failed to update password");
    } finally {
      setPwLoading(false);
    }
  }

  function openConnectForm(platform: Platform) {
    setActiveForm(platform);
    setFormValues({});
    setFormError(null);
    setFormSuccess(null);
  }

  function cancelForm() {
    setActiveForm(null);
    setFormValues({});
    setFormError(null);
  }

  async function submitConnect(e: FormEvent, platform: Platform) {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const def = PLATFORMS.find((p) => p.id === platform)!;
      const credentials: Record<string, string> = {};
      for (const f of def.fields) {
        const v = (formValues[f.key] ?? "").trim();
        if (!v) {
          setFormError(`${f.label} is required`);
          setFormSubmitting(false);
          return;
        }
        credentials[f.key] = v;
      }
      const res = await fetch(`${import.meta.env.BASE_URL}api/user/trading-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ platform, credentials }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data?.error ?? `Failed to save ${platform} credentials`);
        return;
      }
      setFormSuccess(`${def.name} connected.`);
      setActiveForm(null);
      setFormValues({});
      await loadAccounts();
    } catch (err: any) {
      setFormError(err?.message ?? "Failed to save credentials");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function confirmDisconnect() {
    if (!pendingDisconnect) return;
    setDisconnecting(true);
    setAccountsError(null);
    try {
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/user/trading-accounts/${pendingDisconnect}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAccountsError(data?.error ?? "Failed to disconnect");
        return;
      }
      setPendingDisconnect(null);
      await loadAccounts();
    } catch (err: any) {
      setAccountsError(err?.message ?? "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  if (!user) return null;

  const isAdmin = user.role === "admin";
  const accountByPlatform = new Map<Platform, TradingAccount>();
  for (const a of accounts) {
    accountByPlatform.set(a.platform as Platform, a);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and trading connections.</p>
      </div>

      <section className="rounded-2xl bg-card border border-border p-4 md:p-6 space-y-4">
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Account</h2>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-primary text-xl">
            {user.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-lg">{user.name}</span>
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                  <UserIcon className="w-3 h-3" /> User
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground truncate">{user.email}</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-card border border-border p-4 md:p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Trading Accounts</h2>
          <div className="text-xs text-muted-foreground">Encrypted at rest · never shown after save</div>
        </div>

        {accountsError && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 mb-4">
            {accountsError}
          </div>
        )}
        {formSuccess && (
          <div className="text-sm text-success bg-success/10 border border-success/30 rounded-lg px-3 py-2 mb-4">
            {formSuccess}
          </div>
        )}

        <div className="space-y-3">
          {PLATFORMS.map((p) => {
            const acct = accountByPlatform.get(p.id);
            const configured = !!acct;
            const isFormOpen = activeForm === p.id;
            return (
              <div
                key={p.id}
                className="rounded-xl border border-border bg-background/40 p-4"
                data-testid={`trading-account-${p.id}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Plug className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{p.name}</span>
                        {accountsLoading ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                            <Loader2 className="w-3 h-3 animate-spin" /> Loading
                          </span>
                        ) : configured ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30"
                            data-testid={`status-${p.id}`}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Configured
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border"
                            data-testid={`status-${p.id}`}
                          >
                            <Circle className="w-3 h-3" /> Not configured
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                      {p.note && (
                        <p className="text-xs text-warning mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {p.note}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!configured && !isFormOpen && (
                      <button
                        type="button"
                        onClick={() => openConnectForm(p.id)}
                        className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition flex items-center gap-1.5"
                        data-testid={`connect-${p.id}`}
                      >
                        <Plug2 className="w-4 h-4" /> Connect
                      </button>
                    )}
                    {configured && (
                      <button
                        type="button"
                        onClick={() => setPendingDisconnect(p.id)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition flex items-center gap-1.5"
                        data-testid={`disconnect-${p.id}`}
                      >
                        <Trash2 className="w-4 h-4" /> Disconnect
                      </button>
                    )}
                  </div>
                </div>

                {isFormOpen && (
                  <form
                    onSubmit={(e) => submitConnect(e, p.id)}
                    className="mt-4 pt-4 border-t border-border space-y-3"
                    data-testid={`connect-form-${p.id}`}
                  >
                    {p.fields.map((f) => (
                      <div key={f.key}>
                        <label className="block text-sm font-medium mb-1">{f.label}</label>
                        <input
                          type={f.type}
                          value={formValues[f.key] ?? ""}
                          onChange={(e) =>
                            setFormValues((v) => ({ ...v, [f.key]: e.target.value }))
                          }
                          required
                          autoComplete="off"
                          className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                          data-testid={`field-${p.id}-${f.key}`}
                        />
                      </div>
                    ))}
                    {formError && (
                      <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                        {formError}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="submit"
                        disabled={formSubmitting}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
                        data-testid={`save-${p.id}`}
                      >
                        {formSubmitting ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelForm}
                        disabled={formSubmitting}
                        className="px-4 py-2 rounded-lg border border-border hover:bg-secondary transition"
                        data-testid={`cancel-${p.id}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl bg-card border border-border p-4 md:p-6">
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-4">Change password</h2>
        <form onSubmit={onChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Current password</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 pr-16 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">New password</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3 py-2 pr-16 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Minimum 8 characters.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm new password</label>
            <input
              type={showNew ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          {pwError && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="text-sm text-success bg-success/10 border border-success/30 rounded-lg px-3 py-2">
              {pwSuccess}
            </div>
          )}
          <button
            type="submit"
            disabled={pwLoading}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {pwLoading ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>

      <Dialog
        open={pendingDisconnect !== null}
        onOpenChange={(open) => {
          if (!open && !disconnecting) setPendingDisconnect(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Disconnect {PLATFORMS.find((p) => p.id === pendingDisconnect)?.name ?? "platform"}?
            </DialogTitle>
            <DialogDescription>
              Remove your stored credentials. You will need to reconnect to execute live trades on this platform.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex items-center justify-end gap-2 flex-wrap sm:flex-row">
            <button
              type="button"
              onClick={() => setPendingDisconnect(null)}
              disabled={disconnecting}
              className="px-4 py-2 rounded-lg border border-border hover:bg-secondary transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50 transition"
              data-testid="confirm-disconnect"
            >
              {disconnecting ? "Removing…" : "Disconnect"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
