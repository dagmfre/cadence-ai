import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, MessageSquareText, Play, Send, Tag, X } from "lucide-react";
import { api, ragColor, type PendingAction, type RunRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Implements Actions.dc.html — the approve-and-apply surface. */

const KIND = {
  label: { icon: Tag, verb: "Label" },
  comment: { icon: MessageSquareText, verb: "Comment on" },
  dm: { icon: Send, verb: "DM" },
} as const;

type CardState = { status: "applying" } | { status: "applied"; text: string } | { status: "failed"; text: string };

export default function Actions({ onPendingChange }: { onPendingChange?: (n: number) => void }) {
  const [pending, setPending] = useState<PendingAction[] | null>(null);
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [cardState, setCardState] = useState<Record<string, CardState>>({});
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .pending()
      .then((p) => {
        setPending(p);
        onPendingChange?.(p.length);
      })
      .catch((e: Error) => {
        setPending([]);
        setError(e.message);
      });
    api.runs().then(setRuns).catch(() => setRuns([]));
  };
  useEffect(load, []);

  const apply = async (a: PendingAction) => {
    setCardState((s) => ({ ...s, [a.id]: { status: "applying" } }));
    try {
      const { applied } = await api.approve(a.id);
      // The server returns what actually happened — including graceful degradations
      // like an unmapped owner falling back to the channel.
      const degraded = /unmapped|failed|skipped/i.test(applied);
      setCardState((s) => ({ ...s, [a.id]: { status: degraded ? "failed" : "applied", text: applied } }));
      setTimeout(load, 1200); // let the result read before the card leaves
    } catch (e) {
      setCardState((s) => ({ ...s, [a.id]: { status: "failed", text: (e as Error).message } }));
    }
  };

  const dismiss = async (a: PendingAction, verb: string, target: string) => {
    setCardState((s) => ({ ...s, [a.id]: { status: "applying" } }));
    await api.dismiss(a.id).catch(() => {});
    setNotice(`Dismissed ${verb.toLowerCase()} ${target}.`);
    load();
  };

  const runScan = async () => {
    setScanning(true);
    setError(null);
    setNotice(null);
    try {
      const { run } = await api.runDailyScan();
      setNotice(`Scan complete — ${run.findingCount} findings. ${run.applied.length} action(s) processed.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
      load();
    }
  };

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold leading-[26px]">Actions</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The closed loop: review what Cadence drafted, apply what you approve.
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-80"
        >
          {scanning ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {scanning ? "Running scan…" : "Run scan now"}
        </button>
      </header>

      {notice && (
        <p role="status" className="rounded-[10px] border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-[10px] border border-border bg-card px-4 py-2.5 text-sm">
          <span className="text-rag-red">Couldn’t complete that: </span>
          <span className="text-muted-foreground">{error}</span>
        </p>
      )}

      <section aria-labelledby="pending-h">
        <h2 id="pending-h" className="mb-3 text-base font-medium leading-[22px]">
          Awaiting approval {pending && pending.length > 0 && `(${pending.length})`}
        </h2>
        {!pending ? (
          <div className="h-24 animate-pulse rounded-[10px] bg-secondary" />
        ) : pending.length === 0 ? (
          <div className="rounded-[10px] border border-border bg-card px-4 py-11 text-center">
            <Check className="mx-auto size-6 text-ink-faint" strokeWidth={1.6} aria-hidden />
            <p className="mb-1 mt-3 font-medium">Nothing queued</p>
            <p className="mx-auto max-w-[46ch] text-[13px] text-muted-foreground">
              Run a scan in copilot mode and everything Cadence wants to do lands here for your approval first.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((a) => {
              const { icon: Icon, verb } = KIND[a.kind];
              const target = a.kind === "dm" ? `@${a.githubLogin}` : `#${a.itemNumber}`;
              const state = cardState[a.id];
              return (
                <article key={a.id} className="flex flex-wrap items-start gap-4 rounded-[10px] border border-border bg-card px-[18px] py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <Icon className="size-4 text-muted-foreground" aria-hidden />
                      {verb} <span className="font-mono">{target}</span>
                    </p>
                    {/* The exact text Cadence will post — never truncated. */}
                    <blockquote className="mt-2.5 max-w-[75ch] whitespace-pre-wrap rounded-md border border-border bg-background px-3 py-2.5 text-[13px] leading-[18px] text-muted-foreground">
                      {a.value}
                    </blockquote>
                    {state?.status === "applied" && (
                      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-rag-green">
                        <Check className="size-3.5" aria-hidden />
                        {state.text}
                      </p>
                    )}
                    {state?.status === "failed" && (
                      <p className="mt-2 flex items-start gap-1.5 text-[13px] text-rag-red">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>
                          {state.text}
                          {/unmapped/i.test(state.text) && (
                            <span className="text-muted-foreground"> — fix the mapping in Settings so the next nudge lands directly.</span>
                          )}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {state?.status === "applying" ? (
                      <span className="inline-flex h-[30px] items-center gap-1.5 px-2.5 text-[13px] text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        Applying…
                      </span>
                    ) : state ? null : (
                      <>
                        <button
                          onClick={() => apply(a)}
                          className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-primary px-[11px] text-[13px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Check className="size-3.5" aria-hidden />
                          Approve &amp; apply
                        </button>
                        <button
                          onClick={() => dismiss(a, verb, target)}
                          className="inline-flex h-[30px] items-center gap-1.5 rounded-md px-[11px] text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <X className="size-3.5" aria-hidden />
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="runs-h">
        <h2 id="runs-h" className="mb-3 text-base font-medium leading-[22px]">
          Run history
        </h2>
        {!runs ? (
          <div className="h-24 animate-pulse rounded-[10px] bg-secondary" />
        ) : runs.length === 0 ? (
          <p className="rounded-[10px] border border-border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">
            No runs yet. “Run scan now” executes the full pipeline and records the result here.
          </p>
        ) : (
          <div className="space-y-2.5">
            {runs.map((r) => (
              <details key={r.id} className="group rounded-[10px] border border-border bg-card">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
                  <span className="font-mono text-xs text-ink-faint">{new Date(r.at).toLocaleString()}</span>
                  <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-muted-foreground">{r.trigger}</span>
                  <span className={cn("font-medium capitalize", ragColor[r.forecast.rag])}>
                    <span className="mr-1.5 inline-block size-1.5 rounded-full bg-current align-middle" aria-hidden />
                    {r.forecast.rag} · {r.forecast.completionLikelihood}%
                  </span>
                  <span className="text-muted-foreground">{r.findingCount} findings</span>
                  <span className="ml-auto text-xs text-ink-faint group-open:hidden">details</span>
                </summary>
                <div className="space-y-3 border-t border-border px-4 py-3">
                  <ul className="space-y-1 text-[13px]">
                    {r.applied.map((line, i) => (
                      <li key={i} className="text-muted-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                  <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-sans text-[13px] leading-[18px] text-muted-foreground">
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
