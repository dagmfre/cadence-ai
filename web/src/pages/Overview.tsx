import { useEffect, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { CheckCircle2, ExternalLink, RefreshCw, X } from "lucide-react";
import { api, type DeliveryItem, type RiskFinding, type ScanResult } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Implements Overview.dc.html from the Cadence Engineering Manager design project. */

const RAG = {
  red: { word: "Off track", color: "var(--rag-red)" },
  amber: { word: "At risk", color: "var(--rag-amber)" },
  green: { word: "On track", color: "var(--rag-green)" },
} as const;

const SEVERITY = {
  high: { color: "var(--rag-red)", label: "High" },
  medium: { color: "var(--rag-amber)", label: "Medium" },
  low: { color: "var(--ink-faint)", label: "Low" },
} as const;

/** Category chips are informational, not status — low-chroma tints (DESIGN.md §2). */
const CATEGORY_CHIP: Record<string, CSSProperties> = {
  "board-stagnation": { background: "oklch(.30 .045 300)", color: "oklch(.86 .09 300)" },
  "failing-ci": { background: "oklch(.30 .045 10)", color: "oklch(.86 .09 10)" },
  "review-bottleneck": { background: "oklch(.30 .045 195)", color: "oklch(.86 .09 195)" },
  "blocked-issue": { background: "oklch(.30 .045 10)", color: "oklch(.86 .09 10)" },
  "stalled-pr": { background: "oklch(.30 .045 250)", color: "oklch(.86 .09 250)" },
  "unassigned-at-risk": { background: "oklch(.30 .045 70)", color: "oklch(.86 .09 70)" },
};
const chipStyle = (category: string): CSSProperties =>
  CATEGORY_CHIP[category] ?? { background: "var(--accent)", color: "var(--muted-foreground)" };

const BOARD_COLUMNS = ["Backlog", "Ready", "In progress", "In review", "Done"];

/** Stable per-login hue so the same person keeps the same avatar colour. */
function Avatar({ login }: { login: string }) {
  const hue = [...login].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = login.slice(0, 2).toUpperCase();
  return (
    <span
      title={login}
      className="inline-grid size-[22px] place-items-center rounded-full text-[10px] font-semibold"
      style={{ background: `oklch(.72 .12 ${hue})`, color: "oklch(.18 .02 260)" }}
    >
      {initials}
    </span>
  );
}

const Bar = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-md bg-secondary", className)} />
);

function LoadingView() {
  return (
    <div aria-busy>
      <div className="flex flex-wrap items-center gap-10 rounded-[10px] border border-border bg-card px-[22px] py-5">
        <div>
          <Bar className="h-[30px] w-[76px]" />
          <Bar className="mt-2.5 h-3.5 w-[88px]" />
        </div>
        <div className="flex gap-9">
          <Bar className="h-9 w-[72px]" />
          <Bar className="h-9 w-[72px]" />
          <Bar className="h-9 w-[72px]" />
        </div>
        <div className="min-w-[200px] flex-1">
          <Bar className="h-3 w-full" />
          <Bar className="mt-2 h-3 w-4/5" />
        </div>
      </div>
      <Bar className="my-7 h-4 w-[120px]" />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[10px] border border-border bg-card px-4 py-3.5">
            <Bar className="h-3.5 w-[70%]" />
            <Bar className="my-3 h-5 w-[150px]" />
            <Bar className="mt-2 h-3 w-full" />
            <Bar className="mt-2 h-3 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Overview({ repo }: { repo?: string | null }) {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const query = (new URLSearchParams(useLocation().search).get("q") ?? "").toLowerCase();

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .scan()
      .then(setScan)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const model = scan?.model;
  const matches = (text: string) => !query || text.toLowerCase().includes(query);
  const titleOf = (n: number) => model?.items.find((i) => i.number === n)?.title ?? "";
  const filteredFindings = (scan?.findings ?? []).filter(
    (f) => matches(f.category) || matches(f.reason) || matches(titleOf(f.itemNumber)) || matches(`#${f.itemNumber}`),
  );
  const openItems = (model?.items ?? []).filter((i) => i.state === "open" && (matches(i.title) || matches(`#${i.number}`)));
  const due = model?.sprint.dueOn
    ? new Date(model.sprint.dueOn).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "no due date";

  return (
    <div className="max-w-[1200px]">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-xl font-semibold leading-[26px]">
            {model ? model.sprint.title : loading ? "Loading sprint…" : "No active sprint"}
          </h1>
          {/* Don't print placeholder sprint metadata when there is no sprint to describe. */}
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <span className="font-mono">{model?.repo ?? repo ?? "—"}</span>
            {model && (
              <>
                <span className="text-ink-faint">·</span>
                <span>due {due}</span>
                <span className="text-ink-faint">·</span>
                <span>
                  {model.sprint.closedCount} closed / {model.sprint.openCount} open
                </span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-secondary px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
          {loading ? "Scanning…" : "Rescan"}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-[10px] border border-border bg-card px-5 py-6 text-center">
          <p className="font-medium">Nothing to scan yet</p>
          <p className="mx-auto mt-1.5 max-w-[60ch] text-sm text-muted-foreground">{error}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={load}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Scan again
            </button>
            <Link
              to="/wizard"
              className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Change repository
            </Link>
          </div>
        </div>
      )}

      {loading && !scan && <LoadingView />}

      {query && (
        <p className="mb-4 flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
          Filtering by “<span className="text-foreground">{query}</span>”
          <Link to="/" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
            <X className="size-3.5" aria-hidden />
            Clear
          </Link>
        </p>
      )}

      {scan && model && !error && (
        <div className={cn(loading && "opacity-60 transition-opacity")}>
          <RagBanner scan={scan} />
          <Risks findings={filteredFindings} items={model.items} query={query} />

          <h2 className="mb-3 mt-7 text-base font-medium leading-[22px]">Board</h2>
          <div className="flex gap-2.5 overflow-x-auto">
            {BOARD_COLUMNS.map((col) => (
              <div key={col} className="min-w-24 flex-1 rounded-[10px] border border-border bg-card px-[13px] py-[11px]">
                <div className="text-xs text-muted-foreground">{col}</div>
                <div className="mt-1 text-base font-medium">{model.items.filter((i) => i.boardStatus === col).length}</div>
              </div>
            ))}
          </div>

          <ItemsTable items={openItems} />
        </div>
      )}
    </div>
  );
}

function RagBanner({ scan }: { scan: ScanResult }) {
  const { forecast, model } = scan;
  const rag = RAG[forecast.rag];
  return (
    <div className="flex flex-wrap items-center gap-x-11 gap-y-5 rounded-[10px] border border-border bg-card px-6 py-5">
      <div className="flex-none">
        <div className="text-[30px] font-semibold leading-8 tracking-[-0.02em]" style={{ color: rag.color }}>
          {forecast.completionLikelihood}%
        </div>
        <div className="mt-1.5 flex items-center gap-[7px] font-medium" style={{ color: rag.color }}>
          <span className="size-2 rounded-full" style={{ background: rag.color }} aria-hidden />
          {rag.word}
        </div>
      </div>
      <dl className="m-0 flex flex-none gap-9">
        <div>
          <dt className="text-xs text-muted-foreground">Projected slip</dt>
          <dd className="mt-1 font-medium">{forecast.projectedSlipDays}d</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Days left</dt>
          <dd className="mt-1 font-medium">{forecast.daysLeft}d</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Closed last 7d</dt>
          <dd className="mt-1 font-medium">{model.closedLast7Days}</dd>
        </div>
      </dl>
      <p className="m-0 min-w-[280px] max-w-[62ch] flex-1 text-pretty text-[13px] leading-5 text-muted-foreground">
        {forecast.narrative ??
          `${scan.findings.length} risk${scan.findings.length === 1 ? "" : "s"} across ${model.sprint.openCount} open items. Run a full scan from Actions for Cadence's written root-cause analysis.`}
      </p>
    </div>
  );
}

function Risks({ findings, items, query }: { findings: RiskFinding[]; items: DeliveryItem[]; query: string }) {
  return (
    <>
      <h2 className="mb-3 mt-7 text-base font-medium leading-[22px]">Risks ({findings.length})</h2>
      {findings.length === 0 ? (
        <div className="rounded-[10px] border border-border bg-card px-4 py-11 text-center">
          <CheckCircle2 className="mx-auto size-6 text-rag-green" strokeWidth={1.6} aria-hidden />
          <p className="mb-1 mt-3 font-medium">{query ? "No risks match that search" : "No risks detected"}</p>
          <p className="mx-auto m-0 max-w-[46ch] text-[13px] text-muted-foreground">
            {query
              ? "Try a different item number, title or category — or clear the filter above."
              : "Every open item is moving. Cadence keeps watching the repo, board and Slack and will surface risks the moment they appear."}
          </p>
        </div>
      ) : (
        // min() lets a card shrink below 360px on narrow screens instead of
        // forcing the whole page to scroll sideways.
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))]">
          {findings.map((f) => {
            const sev = SEVERITY[f.severity];
            const item = items.find((i) => i.number === f.itemNumber);
            return (
              <article
                key={`${f.itemNumber}-${f.category}`}
                className="rounded-[10px] border border-border bg-card px-4 py-3.5 transition-colors hover:bg-secondary"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="flex-none font-mono text-[13px] text-ink-faint">#{f.itemNumber}</span>
                  <span className="min-w-0 truncate text-sm font-medium" title={item?.title}>
                    {item?.title ?? f.category}
                  </span>
                </div>
                <div className="my-2.5 flex items-center gap-2">
                  <span className="inline-flex h-5 items-center gap-[5px] rounded-md bg-accent px-2 text-xs font-medium text-muted-foreground">
                    <span className="size-1.5 rounded-full" style={{ background: sev.color }} aria-hidden />
                    {sev.label}
                  </span>
                  <span className="inline-flex h-5 items-center rounded-md px-2 text-xs font-medium" style={chipStyle(f.category)}>
                    {f.category}
                  </span>
                </div>
                <p className="m-0 mb-1.5 text-[13px] leading-[18px]">{f.reason}</p>
                {f.rootCause && <p className="m-0 mb-2 text-[13px] leading-[18px] text-muted-foreground">{f.rootCause}</p>}
                {f.recommendedAction && (
                  <p className="m-0 text-[13px] leading-[18px]">
                    <span className="text-muted-foreground">Next:</span> {f.recommendedAction}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function ItemsTable({ items }: { items: DeliveryItem[] }) {
  const th =
    "bg-secondary px-3 py-[9px] text-left text-[11px] font-medium uppercase tracking-[0.02em] text-ink-faint border-b border-border";
  const td = "border-b border-border px-3 py-[9px]";
  return (
    <>
      <h2 className="mb-3 mt-7 text-base font-medium leading-[22px]">Open items ({items.length})</h2>
      <div className="overflow-x-auto rounded-[10px] border border-border bg-card">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={cn(th, "w-16")}>#</th>
              <th className={th}>Title</th>
              <th className={cn(th, "w-[94px]")}>Type</th>
              <th className={cn(th, "w-[88px]")}>CI</th>
              <th className={cn(th, "w-28")}>Board</th>
              <th className={cn(th, "w-24")}>Assignee</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.number} className="transition-colors hover:bg-secondary">
                <td className={td}>
                  <a
                    href={i.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-muted-foreground hover:text-primary"
                  >
                    {i.number}
                    <ExternalLink className="size-[11px]" aria-hidden />
                  </a>
                </td>
                <td className={cn(td, "max-w-[380px] truncate")} title={i.title}>
                  {i.title}
                </td>
                <td className={td}>
                  <span className="inline-flex h-5 items-center rounded-md bg-accent px-2 text-xs font-medium text-muted-foreground">
                    {i.type === "pr" ? (i.draft ? "draft PR" : "PR") : "issue"}
                  </span>
                </td>
                <td
                  className={td}
                  style={{
                    color:
                      i.ciStatus === "failing"
                        ? "var(--rag-red)"
                        : i.ciStatus === "passing"
                          ? "var(--rag-green)"
                          : "var(--ink-faint)",
                  }}
                >
                  {i.ciStatus === "none" ? "—" : i.ciStatus}
                </td>
                <td className={cn(td, "text-muted-foreground")}>{i.boardStatus ?? "—"}</td>
                <td className={td}>
                  {i.assignees.length ? (
                    <span className="flex">
                      {i.assignees.slice(0, 3).map((a) => (
                        <Avatar key={a} login={a} />
                      ))}
                    </span>
                  ) : (
                    <span className="text-ink-faint">unassigned</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
