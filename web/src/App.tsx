import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LayoutDashboard, ListChecks, MessageSquare, Settings as SettingsIcon, Radar } from "lucide-react";
import { api, type Workspace } from "@/lib/api";
import { cn } from "@/lib/utils";
import Overview from "@/pages/Overview";
import Actions from "@/pages/Actions";
import Chat from "@/pages/Chat";
import Settings from "@/pages/Settings";
import Wizard from "@/pages/Wizard";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/actions", label: "Actions", icon: ListChecks },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function App() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const location = useLocation();

  const refreshWs = useCallback(() => {
    api.workspace().then(setWs).catch((e: Error) => setWsError(e.message));
  }, []);
  useEffect(refreshWs, [refreshWs]);

  if (wsError)
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="text-lg font-medium">Can’t reach the Cadence server</p>
          <p className="mt-1 text-muted-foreground">{wsError} — is it running on :8787?</p>
        </div>
      </div>
    );
  if (!ws) return null; // first paint is fast; skeletons live inside pages

  const connected = ws.githubConnected && !!ws.repo;
  const inWizard = location.pathname.startsWith("/wizard");
  if (!connected && !inWizard) return <Navigate to="/wizard" replace />;

  if (inWizard) return <Wizard workspace={ws} onChanged={refreshWs} />;

  return (
    <div className="flex h-full">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-secondary/40">
        <div className="flex items-center gap-2 px-5 pt-5 pb-6">
          <Radar className="size-5 text-primary" aria-hidden />
          <span className="text-base font-semibold tracking-tight">Cadence</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }: { isActive: boolean }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  isActive && "bg-accent text-foreground",
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-border px-5 py-4 text-xs text-muted-foreground">
          <p className="truncate font-mono">{ws.repo}</p>
          <p className="mt-1 capitalize">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" aria-hidden />
            {ws.autonomy} mode
          </p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] px-6 py-6">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/actions" element={<Actions />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/settings" element={<Settings workspace={ws} onChanged={refreshWs} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
