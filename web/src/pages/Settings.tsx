import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type RosterEntry, type Workspace } from "@/lib/api";
import { cn } from "@/lib/utils";

const MODES: { value: Workspace["autonomy"]; label: string; blurb: string }[] = [
  { value: "observe", label: "Observe", blurb: "Draft everything, apply nothing. Reports still post." },
  { value: "copilot", label: "Copilot", blurb: "Report posts; GitHub writes and DMs wait for your approval." },
  { value: "autopilot", label: "Autopilot", blurb: "Everything applies automatically and is logged." },
];

export default function Settings({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string; realName: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .wizardRoster()
      .then((r) => {
        setRoster(r.roster);
        setMembers(r.slackMembers);
      })
      .catch(() => setRoster([]));
  }, []);

  const setAutonomy = async (mode: Workspace["autonomy"]) => {
    setSaving(true);
    await api.settings({ autonomy: mode }).catch(() => {});
    setSaving(false);
    setNotice(`Autonomy set to ${mode}.`);
    onChanged();
  };

  const saveRoster = async () => {
    if (!roster) return;
    setSaving(true);
    const teamMap = Object.fromEntries(roster.filter((r) => r.slackId).map((r) => [r.githubLogin, r.slackId!]));
    await api.settings({ teamMap }).catch(() => {});
    setSaving(false);
    setNotice("Roster saved — nudges now route to these people.");
    onChanged();
  };

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-muted-foreground">Workspace: {workspace.repo}</p>
      </header>

      {notice && (
        <p role="status" className="rounded-md border border-border bg-card px-4 py-2.5 text-sm">
          {notice}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autonomy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setAutonomy(m.value)}
              disabled={saving}
              aria-pressed={workspace.autonomy === m.value}
              className={cn(
                "rounded-md border px-4 py-3 text-left transition-colors",
                workspace.autonomy === m.value ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
              )}
            >
              <p className="font-medium">{m.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{m.blurb}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team roster</CardTitle>
          <p className="text-sm text-muted-foreground">GitHub ↔ Slack mapping — who gets which nudge.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!roster ? (
            <p className="text-muted-foreground">Building roster from the sprint…</p>
          ) : roster.length === 0 ? (
            <p className="text-muted-foreground">No GitHub logins found in the current sprint yet.</p>
          ) : (
            <>
              {roster.map((r, idx) => (
                <div key={r.githubLogin} className="flex items-center gap-3">
                  <span className="w-40 truncate font-mono text-sm">{r.githubLogin}</span>
                  <Select
                    value={r.slackId ?? "none"}
                    onValueChange={(v) =>
                      setRoster((cur) => cur!.map((x, i) => (i === idx ? { ...x, slackId: v === "none" ? null : v } : x)))
                    }
                  >
                    <SelectTrigger className="w-56">
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
                  <span className="text-xs text-muted-foreground">{r.confidence}</span>
                </div>
              ))}
              <Button onClick={saveRoster} disabled={saving}>
                Save roster
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
