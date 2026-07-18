import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LayoutDashboard, ListChecks, LogOut, MessageSquare, Settings as SettingsIcon } from "lucide-react";
import { api, type AuthUser, type Workspace } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
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

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booted, setBooted] = useState(false);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const location = useLocation();

  // Boot: who am I?
  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setBooted(true));
  }, []);

  const refreshWs = useCallback(() => {
    if (!user) return;
    api.workspace().then(setWs).catch(() => setWs(null));
    api.pending().then((p) => setPendingCount(p.length)).catch(() => setPendingCount(0));
  }, [user]);
  useEffect(refreshWs, [refreshWs]);

  const signOut = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setWs(null);
  };

  if (!booted) return null;
  if (!user) return <Auth onSignedIn={setUser} />;
  if (!ws) return null;

  const connected = ws.githubConnected && !!ws.repo;
  const inWizard = location.pathname.startsWith("/wizard");
  if (!connected && !inWizard) return <Navigate to="/wizard" replace />;
  if (inWizard) return <Wizard workspace={ws} onChanged={refreshWs} />;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
        <Logo />
        <span className="hidden rounded-md border border-border bg-secondary px-2.5 py-1 font-mono text-xs text-muted-foreground sm:inline">
          {ws.repo}
        </span>
        <div className="flex-1" />
        <AccountMenu email={user.email} onSignOut={signOut} />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="hidden w-[232px] shrink-0 flex-col border-r border-border bg-secondary/40 px-2.5 py-3 md:flex">
          <nav className="flex flex-col gap-0.5" aria-label="Main">
            {GROUPS.map((group) => (
              <div key={group}>
                <p className="px-2.5 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {group}
                </p>
                {NAV.filter((n) => n.group === group).map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/"}
                    className={({ isActive }: { isActive: boolean }) =>
                      cn(
                        "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                        isActive &&
                          "bg-primary/15 text-foreground before:absolute before:-left-2.5 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r before:bg-primary",
                      )
                    }
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                    {to === "/actions" && pendingCount > 0 && (
                      <span className="ml-auto rounded-full bg-secondary px-1.5 text-[11px] text-muted-foreground">{pendingCount}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="mt-auto border-t border-border pt-3">
            <p className="px-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">Autonomy</p>
            <div className="mt-2 flex gap-0.5 rounded-md bg-secondary p-0.5" role="group" aria-label="Autonomy mode">
              {(["observe", "copilot", "autopilot"] as const).map((m) => (
                <span
                  key={m}
                  className={cn(
                    "flex-1 rounded px-1 py-1 text-center text-[11px] capitalize text-muted-foreground",
                    ws.autonomy === m && "bg-primary/15 font-medium text-foreground",
                  )}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1180px] px-7 py-6">
            <Routes>
              <Route path="/" element={<Overview />} />
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

/** Native <details> so it closes on Escape and is keyboard-reachable without extra deps. */
function AccountMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <details className="relative [&[open]>summary>span]:ring-2">
      <summary className="flex cursor-pointer list-none items-center outline-none" aria-label="Account menu">
        <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground ring-ring ring-offset-2 ring-offset-card">
          {initials}
        </span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-popover p-1.5 shadow-md">
        <p className="border-b border-border px-2.5 pb-2.5 pt-1.5 text-xs text-muted-foreground">{email}</p>
        <button
          onClick={onSignOut}
          className="mt-1.5 flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-rag-red transition-colors hover:bg-accent"
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </div>
    </details>
  );
}
