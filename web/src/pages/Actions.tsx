import { useEffect, useState } from "react";
import { Check, Play, Tag, MessageSquareText, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ragColor, type PendingAction, type RunRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

const KIND = {
  label: { icon: Tag, verb: "Label" },
  comment: { icon: MessageSquareText, verb: "Comment on" },
  dm: { icon: Send, verb: "DM" },
} as const;

export default function Actions({ onPendingChange }: { onPendingChange?: (n: number) => void }) {
  const [pending, setPending] = useState<PendingAction[] | null>(null);
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // action id or "scan"
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    api
      .pending()
      .then((p) => {
        setPending(p);
        onPendingChange?.(p.length);
      })
      .catch(() => setPending([]));
    api.runs().then(setRuns).catch(() => setRuns([]));
  };
  useEffect(load, []);

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await fn();
      setNotice(done);
      load();
    } catch (e) {
      setNotice(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const runScan = () =>
    act("scan", api.runDailyScan, "Scan complete — report posted, actions drafted or applied per autonomy mode.");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Actions</h1>
          <p className="mt-1 text-muted-foreground">The closed loop: review what Cadence drafted, apply what you approve.</p>
        </div>
        <Button onClick={runScan} disabled={busy === "scan"}>
          <Play className="size-4" aria-hidden />
          {busy === "scan" ? "Running full scan…" : "Run scan now"}
        </Button>
      </header>

      {notice && (
        <p role="status" className="rounded-md border border-border bg-card px-4 py-2.5 text-sm">
          {notice}
        </p>
      )}

      <section aria-labelledby="pending-h">
        <h2 id="pending-h" className="mb-3 text-base font-medium">
          Awaiting approval {pending && pending.length > 0 && `(${pending.length})`}
        </h2>
        {!pending ? (
          <Skeleton className="h-24 w-full" />
        ) : pending.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing queued. Run a scan in copilot mode and drafted actions land here for review.
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((a) => {
              const { icon: Icon, verb } = KIND[a.kind];
              const target = a.kind === "dm" ? `@${a.githubLogin}` : `#${a.itemNumber}`;
              return (
                <Card key={a.id}>
                  <CardContent className="flex flex-wrap items-start gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                        {verb} <span className="font-mono">{target}</span>
                      </p>
                      <blockquote className="mt-2 max-w-[75ch] whitespace-pre-wrap border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground rounded-md">
                        {a.value}
                      </blockquote>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => act(a.id, () => api.approve(a.id), `Applied: ${verb.toLowerCase()} ${target}`)} disabled={busy === a.id}>
                        <Check className="size-3.5" aria-hidden />
                        Approve & apply
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => act(a.id, () => api.dismiss(a.id), `Dismissed ${verb.toLowerCase()} ${target}`)} disabled={busy === a.id}>
                        <X className="size-3.5" aria-hidden />
                        Dismiss
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="runs-h">
        <h2 id="runs-h" className="mb-3 text-base font-medium">
          Run history
        </h2>
        {!runs ? (
          <Skeleton className="h-24 w-full" />
        ) : runs.length === 0 ? (
          <p className="text-muted-foreground">No runs yet — “Run scan now” executes the full pipeline and records it here.</p>
        ) : (
          <div className="space-y-3">
            {runs.map((r) => (
              <details key={r.id} className="group rounded-md border border-border bg-card">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="font-mono text-xs text-muted-foreground">{new Date(r.at).toLocaleString()}</span>
                  <Badge variant="outline">{r.trigger}</Badge>
                  <span className={cn("font-medium capitalize", ragColor[r.forecast.rag])}>
                    <span className="mr-1.5 inline-block size-1.5 rounded-full bg-current align-middle" aria-hidden />
                    {r.forecast.rag} · {r.forecast.completionLikelihood}%
                  </span>
                  <span className="text-muted-foreground">{r.findingCount} findings</span>
                  <span className="ml-auto text-xs text-muted-foreground group-open:hidden">details</span>
                </summary>
                <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
                  <ul className="space-y-1">
                    {r.applied.map((line, i) => (
                      <li key={i} className="text-muted-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                  <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded-md bg-background/60 p-3 font-sans text-muted-foreground">
                    {r.report}
                  </pre>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
