import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Play,
  Search,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import { api, followScan, setUnauthorizedHandler, type AuthUser, type Workspace } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "@/components/Logo";
import Auth from "@/pages/Auth";
import Overview from "@/pages/Overview";
import Actions from "@/pages/Actions";
import Chat from "@/pages/Chat";
import Settings from "@/pages/Settings";
import Wizard from "@/pages/Wizard";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, group: "Delivery" },
  { to: "/actions", label: "Actions", icon: ListChecks, group: "Delivery" },
  { to: "/chat", label: "Chat", icon: MessageSquare, group: "Delivery" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, group: "Workspace" },
];
const GROUPS = ["Delivery", "Workspace"] as const;
const MODES = ["observe", "copilot", "autopilot"] as const;

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booted, setBooted] = useState(false);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Any 401 anywhere returns to the sign-in screen instead of a misleading page error.
  useEffect(() => setUnauthorizedHandler(() => setUser(null)), []);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setBooted(true));
  }, []);

  const refreshWs = useCallback(() => {
    if (!user) return;
    setWsError(null);
    api
      .workspace()
      .then(setWs)
      .catch((e: Error) => setWsError(e.message));
    api
      .pending()
      .then((p) => setPendingCount(p.length))
      .catch(() => setPendingCount(0));
  }, [user]);
  useEffect(refreshWs, [refreshWs]);

  useEffect(() => setNavOpen(false), [location.pathname]);

  const signOut = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setWs(null);
  };

  const runScan = async () => {
    setScanning(true);
    try {
      // Start first, then navigate: Actions checks for a run in flight on mount, and
      // that check has to happen after the server knows about this one.
      await api.runDailyScan();
      navigate("/actions");
      await followScan({ resume: true }); // minutes, not seconds — Actions mirrors the progress
    } catch {
      /* Actions surfaces the failure */
    } finally {
      setScanning(false);
      refreshWs();
    }
  };

  const setAutonomy = async (mode: Workspace["autonomy"]) => {
    setWs((w) => (w ? { ...w, autonomy: mode } : w)); // optimistic
    await api.settings({ autonomy: mode }).catch(() => {});
    refreshWs();
  };

  if (!booted) return <Splash />;
  if (!user) return <Auth onSignedIn={setUser} />;
  if (wsError) return <LoadFailed message={wsError} onRetry={refreshWs} onSignOut={signOut} />;
  if (!ws) return <Splash />;

  const connected = ws.githubConnected && !!ws.repo;
  const inWizard = location.pathname.startsWith("/wizard");
  if (!connected && !inWizard) return <Navigate to="/wizard" replace />;
  if (inWizard) return <Wizard workspace={ws} onChanged={refreshWs} />;

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="px-2.5 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">{group}</p>
          {NAV.filter((n) => n.group === group).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }: { isActive: boolean }) =>
                cn(
                  "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  isActive &&
                    "bg-primary/15 text-foreground before:absolute before:-left-2.5 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r before:bg-primary",
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
              {to === "/actions" && pendingCount > 0 && (
                <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] text-muted-foreground">{pendingCount}</span>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  const dial = (
    <div className="border-t border-border pt-3">
      <p className="px-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Autonomy</p>
      <div className="mt-2 flex gap-0.5 rounded-md bg-accent p-0.5" role="group" aria-label="Autonomy mode">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setAutonomy(m)}
            aria-pressed={ws.autonomy === m}
            className={cn(
              "flex-1 rounded px-1 py-1 text-center text-[11px] capitalize text-ink-faint outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              ws.autonomy === m && "bg-primary/15 font-medium text-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 px-0.5 font-mono text-xs text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-rag-green" aria-hidden />
        <span className="truncate">{ws.repo}</span>
      </p>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
        <button
          onClick={() => setNavOpen(true)}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-4" aria-hidden />
        </button>

        <Logo />

        <span className="hidden rounded-md border border-border bg-secondary px-2.5 py-1 font-mono text-xs text-muted-foreground lg:inline">
          {ws.repo}
        </span>

        <SearchBox />

        <div className="flex-1" />

        <button
          onClick={runScan}
          disabled={scanning}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-80"
        >
          {scanning ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{scanning ? "Running scan…" : "Run scan"}</span>
        </button>

        <button
          onClick={() => navigate("/actions")}
          className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${pendingCount} actions awaiting approval`}
        >
          <Bell className="size-4" aria-hidden />
          {pendingCount > 0 && (
            <span className="absolute right-0.5 top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {pendingCount}
            </span>
          )}
        </button>

        <AccountMenu email={user.email} onSignOut={signOut} onSettings={() => navigate("/settings")} />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[232px] shrink-0 flex-col border-r border-border bg-secondary/40 px-2.5 py-3 md:flex">
          {nav}
          <div className="mt-auto">{dial}</div>
        </aside>

        {navOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button className="absolute inset-0 bg-background/80" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[260px] flex-col border-r border-border bg-secondary px-2.5 py-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
                  <LogoMark />
                  Cadence
                </span>
                <button
                  onClick={() => setNavOpen(false)}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close navigation"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              {nav}
              <div className="mt-auto">{dial}</div>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-7 sm:py-6">
            <Routes>
              <Route path="/" element={<Overview repo={ws.repo} />} />
              <Route path="/actions" element={<Actions onPendingChange={setPendingCount} />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/settings" element={<Settings workspace={ws} onChanged={refreshWs} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

/** Search routes to Overview, which does the filtering — no dead control in the bar. */
function SearchBox() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/");
      }}
      className="hidden h-[30px] max-w-[340px] flex-1 items-center gap-2 rounded-md border border-border bg-secondary px-2.5 focus-within:border-primary md:flex"
    >
      <Search className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search items and risks"
        aria-label="Search items and risks"
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
      />
    </form>
  );
}

function Splash() {
  return (
    <div className="grid h-full place-items-center">
      <LogoMark className="size-7 animate-pulse" />
    </div>
  );
}

function LoadFailed({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="max-w-md rounded-[10px] border border-border bg-card p-6 text-center">
        <p className="font-medium">Couldn’t load your workspace</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={onRetry}
            className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <button onClick={onSignOut} className="h-8 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-secondary">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountMenu({ email, onSignOut, onSettings }: { email: string; onSignOut: () => void; onSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = email.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        {initials}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-50 w-56 rounded-[10px] border border-border bg-popover p-1.5 shadow-md">
          <p className="border-b border-border px-2.5 pb-2.5 pt-1.5 text-xs text-ink-faint">{email}</p>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
            className="mt-1.5 flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <SettingsIcon className="size-4" aria-hidden />
            Settings
          </button>
          <button
            role="menuitem"
            onClick={onSignOut}
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-rag-red transition-colors hover:bg-secondary"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
