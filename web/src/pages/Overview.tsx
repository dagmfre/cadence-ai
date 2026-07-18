import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ragColor, severityColor, type ScanResult } from "@/lib/api";
import { cn } from "@/lib/utils";

const RAG_WORD = { red: "Off track", amber: "At risk", green: "On track" } as const;
const BOARD_COLUMNS = ["Backlog", "Ready", "In progress", "In review", "Done"];

export default function Overview() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    api
      .scan()
      .then(setScan)
      .catch((e: Error) => setError(e.message))
      .finally(() => setRefreshing(false));
  };
  useEffect(load, []);

  if (error)
    return (
      <p className="text-muted-foreground">
        Scan failed: {error}. Check the GitHub connection in Settings, then retry.
      </p>
    );
  if (!scan)
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  const { model, findings, forecast } = scan;
  const due = model.sprint.dueOn ? new Date(model.sprint.dueOn).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
  const open = model.items.filter((i) => i.state === "open");

  return (
    <div className="space-y-6">
      {/* RAG banner — the one place the interface raises its voice */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{model.sprint.title}</h1>
          <p className="mt-1 text-muted-foreground">
            {model.repo} · due {due} · {model.sprint.closedCount} closed / {model.sprint.openCount} open
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden />
          {refreshing ? "Scanning…" : "Rescan"}
        </Button>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-4 py-5">
          <div>
            <div className={cn("text-[28px] font-semibold leading-none", ragColor[forecast.rag])}>
              {forecast.completionLikelihood}%
            </div>
            <div className={cn("mt-1.5 font-medium", ragColor[forecast.rag])}>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-current align-middle" aria-hidden />
              {RAG_WORD[forecast.rag]}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-x-10 text-sm">
            <div>
              <dt className="text-muted-foreground">Projected slip</dt>
              <dd className="mt-0.5 font-medium">{forecast.projectedSlipDays}d</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Days left</dt>
              <dd className="mt-0.5 font-medium">{forecast.daysLeft}d</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Closed last 7d</dt>
              <dd className="mt-0.5 font-medium">{model.closedLast7Days}</dd>
            </div>
          </dl>
          {forecast.narrative && <p className="max-w-[65ch] text-sm text-muted-foreground">{forecast.narrative}</p>}
        </CardContent>
      </Card>

      <section aria-labelledby="risks-h">
        <h2 id="risks-h" className="mb-3 flex items-center gap-2 text-base font-medium">
          <AlertTriangle className="size-4 text-rag-amber" aria-hidden />
          Risks ({findings.length})
        </h2>
        {findings.length === 0 ? (
          <p className="text-muted-foreground">No risks detected — the sprint looks healthy.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {findings.map((f) => {
              const item = model.items.find((i) => i.number === f.itemNumber);
              return (
                <Card key={`${f.itemNumber}-${f.category}`} className="gap-2">
                  <CardHeader>
                    <CardTitle className="flex min-w-0 items-baseline gap-2 overflow-hidden text-sm font-medium">
                      <span className="shrink-0 font-mono text-muted-foreground">#{f.itemNumber}</span>
                      <span className="min-w-0 truncate">{item?.title ?? f.category}</span>
                    </CardTitle>
                    <p className="text-xs">
                      <span className={cn("font-medium capitalize", severityColor[f.severity])}>{f.severity}</span>
                      <span className="text-muted-foreground"> · {f.category}</span>
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <p>{f.reason}</p>
                    {f.rootCause && <p className="text-muted-foreground">{f.rootCause}</p>}
                    {f.recommendedAction && (
                      <p>
                        <span className="text-muted-foreground">Next: </span>
                        {f.recommendedAction}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="board-h">
        <h2 id="board-h" className="mb-3 text-base font-medium">
          Board
        </h2>
        <div className="flex gap-2 overflow-x-auto">
          {BOARD_COLUMNS.map((col) => {
            const count = model.items.filter((i) => i.boardStatus === col).length;
            return (
              <div key={col} className="min-w-28 flex-1 rounded-md border border-border px-3 py-2.5">
                <p className="text-xs text-muted-foreground">{col}</p>
                <p className="mt-1 text-base font-medium">{count}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="items-h">
        <h2 id="items-h" className="mb-3 text-base font-medium">
          Open items ({open.length})
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead className="w-28">CI</TableHead>
              <TableHead className="w-32">Board</TableHead>
              <TableHead className="w-36">Assignees</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {open.map((i) => (
              <TableRow key={i.number}>
                <TableCell className="font-mono text-muted-foreground">
                  <a href={i.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                    {i.number}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </TableCell>
                <TableCell className="max-w-md truncate">{i.title}</TableCell>
                <TableCell>
                  <Badge variant="outline">{i.type === "pr" ? (i.draft ? "draft PR" : "PR") : "issue"}</Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    i.ciStatus === "failing" && "text-rag-red",
                    i.ciStatus === "passing" && "text-rag-green",
                    (i.ciStatus === "none" || i.ciStatus === "pending") && "text-muted-foreground",
                  )}
                >
                  {i.ciStatus === "none" ? "—" : i.ciStatus}
                </TableCell>
                <TableCell className="text-muted-foreground">{i.boardStatus ?? "—"}</TableCell>
                <TableCell className="truncate text-muted-foreground">{i.assignees.join(", ") || "unassigned"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
