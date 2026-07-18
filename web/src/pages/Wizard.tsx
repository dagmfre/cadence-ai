import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogoMark } from "@/components/Logo";
import { api, type RosterEntry, type Workspace } from "@/lib/api";
import { cn } from "@/lib/utils";

const STEPS = ["GitHub", "Slack", "Team", "Autonomy"];

export default function Wizard({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const nav = useNavigate();
  // Resume at the first incomplete step (OAuth round-trips reload the page)
  const initialStep = !workspace.githubConnected ? 0 : !workspace.repo ? 0 : !workspace.slackConnected ? 1 : 2;
  const [step, setStep] = useState(initialStep);
  const [maxStep, setMaxStep] = useState(initialStep); // furthest step reached — bounds back-navigation
  useEffect(() => setMaxStep((m) => Math.max(m, step)), [step]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [repos, setRepos] = useState<{ fullName: string }[]>([]);
  const [boards, setBoards] = useState<{ number: number; title: string }[]>([]);
  const [repo, setRepo] = useState(workspace.repo ?? "");
  const [board, setBoard] = useState(workspace.projectNumber == null ? "none" : String(workspace.projectNumber));
  // Step 2 state
  const [slackToken, setSlackToken] = useState("");
  const [channels, setChannels] = useState<{ id: string; name: string; isMember: boolean }[]>([]);
  const [channel, setChannel] = useState(workspace.slackChannelId ?? "");
  const [discovering, setDiscovering] = useState(false);
  // Step 3 state
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterState, setRosterState] = useState<"loading" | "ready" | "failed">("loading");
  const [rosterNote, setRosterNote] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string; realName: string }[]>([]);
  // Step 4 state
  const [autonomy, setAutonomy] = useState<Workspace["autonomy"]>(workspace.autonomy);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (workspace.githubConnected && step === 0) {
      setDiscovering(true);
      Promise.all([
        api.wizardRepos().then(setRepos),
        api.wizardBoards().then(setBoards),
      ])
        .catch((e: Error) => setError(`Couldn't read your GitHub account: ${e.message}`))
        .finally(() => setDiscovering(false));
    }
    if (step === 2) {
      setRosterState("loading");
      api
        .wizardRoster()
        .then((r) => {
          setRoster(r.roster);
          setMembers(r.slackMembers);
          setRosterNote(r.note ?? null);
          setRosterState("ready");
        })
        .catch((e: Error) => {
          setRosterState("failed");
          setRosterNote(e.message);
        });
    }
  }, [step, workspace.githubConnected]);

  const run = async (fn: () => Promise<unknown>, next?: number) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      if (next !== undefined) setStep(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Two different things, deliberately separated: saving the workspace MUST succeed,
   * but the first scan is best-effort. A repo with no milestone (or no board, or an
   * empty sprint) is a setup state, not a wizard failure — so it must never trap the
   * user here. The dashboard is where that guidance belongs.
   */
  const finish = async () => {
    setBusy(true);
    setError(null);
    const teamMap = Object.fromEntries(roster.filter((r) => r.slackId).map((r) => [r.githubLogin, r.slackId!]));
    try {
      await api.wizardComplete(teamMap, autonomy);
    } catch (e) {
      setError(`Couldn't save your setup: ${(e as Error).message}`);
      setBusy(false);
      return;
    }
    setScanning(true);
    await api.scan().catch(() => {}); // warms the dashboard; failure is handled there
    onChanged();
    nav("/");
  };

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <LogoMark className="size-6" />
        <span className="text-xl font-semibold tracking-tight">Cadence</span>
        <span className="text-muted-foreground">· connect your workspace</span>
      </div>

      {/* Steps you've already reached are clickable — setup is rarely linear and
          people need to go back and change a repo, channel or mapping. */}
      <ol className="mb-6 flex gap-1.5" aria-label="Setup steps">
        {STEPS.map((s, i) => {
          const reachable = i <= maxStep;
          return (
            <li key={s} className="flex-1">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => {
                  setError(null);
                  setStep(i);
                }}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
                  reachable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span className={cn("block h-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-secondary")} />
                <span
                  className={cn(
                    "mt-1.5 block text-xs transition-colors",
                    i === step ? "font-medium text-foreground" : reachable ? "text-muted-foreground hover:text-foreground" : "text-ink-faint",
                  )}
                >
                  {s}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <Card>
        <CardContent className="space-y-5 py-6">
          {error && (
            <p role="alert" className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive-foreground">
              {error}
            </p>
          )}

          {step === 0 && (
            <>
              <div>
                <h1 className="text-base font-medium">Connect GitHub</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cadence reads your repo, PRs, checks and Projects board — and writes labels and comments when you approve.
                </p>
              </div>
              {!workspace.githubConnected ? (
                <div className="space-y-3">
                  <Button asChild className="w-full">
                    <a href="/auth/github">Sign in with GitHub</a>
                  </Button>
                  {!showPat ? (
                    <button type="button" onClick={() => setShowPat(true)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                      Advanced: paste a personal access token instead
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="pat">Classic PAT with repo + project scopes</Label>
                      <Input id="pat" type="password" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="ghp_…" />
                      <Button variant="outline" disabled={busy || !pat} onClick={() => run(() => api.wizardGithubPat(pat))}>
                        {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                        Validate token
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="flex items-center gap-2 text-sm">
                    <Check className="size-4 text-rag-green" aria-hidden />
                    Connected{workspace.githubLogin ? ` as ${workspace.githubLogin}` : ""}
                  </p>
                  <div className="space-y-2">
                    <Label>Repository to watch</Label>
                    <Select value={repo} onValueChange={setRepo} disabled={!repos.length}>
                      <SelectTrigger>
                        <SelectValue placeholder={discovering ? "Loading your repositories…" : repos.length ? "Pick a repository" : "No repositories available"} />
                      </SelectTrigger>
                      <SelectContent>
                        {repos.map((r) => (
                          <SelectItem key={r.fullName} value={r.fullName}>
                            {r.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!discovering && !repos.length && (
                      <p className="text-xs text-muted-foreground">
                        Cadence couldn’t list any repositories. Reconnect GitHub, or use a token with the <code className="font-mono">repo</code> scope.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Projects v2 board (optional)</Label>
                    <Select value={board} onValueChange={setBoard}>
                      <SelectTrigger>
                        <SelectValue placeholder={discovering ? "Loading your boards…" : "No board"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No board — skip board signals</SelectItem>
                        {boards.map((b) => (
                          <SelectItem key={b.number} value={String(b.number)}>
                            {b.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      A board adds column signals like “parked in In review”. Everything else works without one.
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    disabled={busy || !repo}
                    onClick={() => run(() => api.wizardRepo(repo, board === "none" ? null : Number(board)), 1)}
                  >
                    {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    Continue
                  </Button>
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h1 className="text-base font-medium">Connect Slack</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create the app from{" "}
                  <a href="/slack-app-manifest.json" download className="underline underline-offset-2">
                    this manifest
                  </a>{" "}
                  at api.slack.com, install it, then paste the bot token. Reports and DMs post from it.
                </p>
              </div>
              {workspace.slackConnected && channels.length === 0 ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-sm">
                    <Check className="size-4 text-rag-green" aria-hidden />
                    Slack connected{workspace.slackChannelId ? ` · channel ${workspace.slackChannelId}` : ""}
                  </p>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => setStep(2)}>
                      Continue
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={() => run(async () => setChannels((await api.wizardSlack()).channels ?? []))}>
                      Change channel
                    </Button>
                  </div>
                </div>
              ) : channels.length === 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="bot">Bot token</Label>
                  <Input id="bot" type="password" value={slackToken} onChange={(e) => setSlackToken(e.target.value)} placeholder="xoxb-…" />
                  <Button
                    className="w-full"
                    disabled={busy || !slackToken}
                    onClick={() => run(async () => setChannels((await api.wizardSlack(slackToken)).channels ?? []))}
                  >
                    {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    Validate & list channels
                  </Button>
                  <button type="button" onClick={() => setStep(2)} className="w-full text-xs text-muted-foreground underline-offset-2 hover:underline">
                    Skip Slack for now — Cadence still labels and comments on GitHub
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label>Report channel (invite the bot with /invite @Cadence)</Label>
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          #{c.name} {c.isMember ? "· bot invited" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button className="w-full" disabled={busy || !channel} onClick={() => run(() => api.wizardSlack(undefined, channel), 2)}>
                    {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    Continue
                  </Button>
                  <button type="button" onClick={() => setStep(2)} className="w-full text-xs text-muted-foreground underline-offset-2 hover:underline">
                    Skip Slack for now
                  </button>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h1 className="text-base font-medium">Confirm your team</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cadence matched the sprint’s GitHub people to Slack members. Fix any misses — this is how nudges reach the right human.
                </p>
              </div>
              {rosterNote && (
                <div className="rounded-md border border-border bg-secondary/60 px-3 py-2.5 text-xs text-muted-foreground">
                  {rosterNote}
                  <span className="block pt-1 text-ink-faint">You can finish setup now and map people later in Settings.</span>
                </div>
              )}
              {rosterState === "loading" ? (
                <p className="text-sm text-muted-foreground">Building the roster from your sprint…</p>
              ) : roster.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No GitHub people to map yet — Cadence will flag contributors as they appear in the sprint.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {roster.map((r, idx) => (
                    <div key={r.githubLogin} className="flex items-center gap-3">
                      <span className="w-32 truncate font-mono text-sm">{r.githubLogin}</span>
                      <Select
                        value={r.slackId ?? "none"}
                        onValueChange={(v) =>
                          setRoster((cur) => cur.map((x, i) => (i === idx ? { ...x, slackId: v === "none" ? null : v } : x)))
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— unmapped —</SelectItem>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.realName || m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span
                        className={cn(
                          "w-20 text-right text-xs",
                          r.confidence === "unmatched" ? "text-rag-amber" : "text-muted-foreground",
                        )}
                      >
                        {r.confidence}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button className="flex-1" onClick={() => setStep(3)}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h1 className="text-base font-medium">How much should Cadence do on its own?</h1>
                <p className="mt-1 text-sm text-muted-foreground">You can change this anytime in Settings.</p>
              </div>
              <div className="space-y-2">
                {(
                  [
                    ["observe", "Observe", "Draft everything, apply nothing."],
                    ["copilot", "Copilot", "Report posts; writes wait for your approval. Recommended."],
                    ["autopilot", "Autopilot", "Labels, comments and DMs apply automatically, logged."],
                  ] as const
                ).map(([value, label, blurb]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAutonomy(value)}
                    aria-pressed={autonomy === value}
                    className={cn(
                      "w-full rounded-md border px-4 py-3 text-left transition-colors",
                      autonomy === value ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                    )}
                  >
                    <p className="font-medium">{label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy} onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button className="flex-1" disabled={busy} onClick={finish}>
                  {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {scanning ? "Running your first scan…" : "Finish & run first scan"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
