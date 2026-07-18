/** Cadence server: scan + pipeline + closed-loop endpoints. */
import { config } from "dotenv";
config();
import Fastify from "fastify";
import path from "node:path";
import { existsSync } from "node:fs";
import { traceable } from "langsmith/traceable";
import { runScan } from "./scan.js";
import { store } from "./store.js";
import { currentWorkspaceId } from "./context.js";
import { registerWizard } from "./wizard.js";
import { registerAuth, isCronRequest } from "./auth.js";
import fastifyCookie from "@fastify/cookie";

const app = Fastify({ logger: { level: "warn" } });
await app.register(fastifyCookie);
registerAuth(app); // must precede the routes it guards
registerWizard(app);

/** A workspace that hasn't finished the wizard is a 409 with a next step, not a 500. */
app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) app.log.error(err); // setup problems (409) are expected, not incidents
  return reply.code(status).send({ error: err.message || "Something failed on the server." });
});

app.get("/api/scan", async () => {
  const scan = await runScan();
  // Carry the last run's root causes / recommended actions onto matching findings,
  // so the dashboard shows the full picture between full pipeline runs.
  const enrichment = new Map(
    (await store.getEnrichment()).map((f) => [`${f.itemNumber}:${f.category}`, f] as const),
  );
  scan.findings = scan.findings.map((f) => {
    const e = enrichment.get(`${f.itemNumber}:${f.category}`);
    return e ? { ...f, rootCause: e.rootCause, recommendedAction: e.recommendedAction } : f;
  });
  await store.setLastScan(scan);
  return scan;
});

/** The full closed loop: scan → agents → act per autonomy mode → record run. */
async function closedLoop(trigger: "daily" | "manual") {
  const { runPipeline } = await import("./agents/pipeline.js");
  const { executePlan } = await import("./actions.js");

  // The deterministic ends of the loop get their own spans so a LangSmith trace
  // shows the whole story: what we read, what the agents decided, what we did.
  const scan = await traceable(runScan, { name: "scan", run_type: "tool" })();
  await store.setLastScan(scan);
  const result = await runPipeline(scan);
  await store.setEnrichment(result.findings); // /api/scan merges these back in
  const applied = await traceable(executePlan, { name: "execute-plan", run_type: "tool" })(result.actionPlan);

  const run = {
    id: `run-${Date.now()}`,
    at: new Date().toISOString(),
    trigger,
    forecast: { ...scan.forecast, narrative: result.forecastNarrative },
    findingCount: result.findings.length,
    report: result.actionPlan.slackReport,
    applied,
  };
  await store.addRun(run);
  return { run, findings: result.findings, actionPlan: result.actionPlan };
}

/**
 * Nobody can hold a request open for the length of a run: cron-job.org caps at 30s
 * and Koyeb's edge returns 504 around 60s, while the pipeline takes 1-4 minutes.
 * So every trigger starts the loop in the background and polls `/api/scan-status`.
 * In-memory and per-workspace — the single-instance assumption already documented.
 */
type ScanState = { startedAt: string; trigger: "daily" | "manual"; error?: string };
const scans = new Map<string, ScanState>();
const scanKey = () => currentWorkspaceId() ?? "default";

const STALE_AFTER = 15 * 60_000; // a real run takes ~3 min; well past that it's abandoned

function startScan(trigger: "daily" | "manual"): ScanState {
  const key = scanKey();
  const running = scans.get(key);
  // A second click joins the first — unless the first hung, which must not lock the
  // workspace out of scanning until the next restart.
  if (running && !running.error && Date.now() - Date.parse(running.startedAt) < STALE_AFTER) return running;

  const state: ScanState = { startedAt: new Date().toISOString(), trigger };
  scans.set(key, state);
  // One LangSmith trace per run; the LangGraph nodes and model calls nest under it.
  void traceable(closedLoop, { name: "cadence-run", run_type: "chain", metadata: { trigger, workspace: key } })(trigger)
    .then(() => scans.delete(key))
    .catch((e: Error) => {
      app.log.error(e, "scan failed");
      scans.set(key, { ...state, error: e.message || "The scan failed." });
    });
  return state;
}

app.post("/run-daily-scan", async (req, reply) => {
  const body = (req.body ?? {}) as { trigger?: string };
  const trigger = isCronRequest(req) ? "daily" : ((body.trigger ?? "manual") as "daily" | "manual");
  const { startedAt } = startScan(trigger);
  return reply.code(202).send({ accepted: true, startedAt, note: "Scan started — poll /api/scan-status." });
});

/** How the dashboard follows a run it can't wait for. */
app.get("/api/scan-status", async () => {
  const state = scans.get(scanKey());
  return {
    running: !!state && !state.error,
    startedAt: state?.startedAt ?? null,
    error: state?.error ?? null,
    lastRun: (await store.getRuns())[0] ?? null,
  };
});

app.get("/api/pending", async () => store.getPending());

app.post("/api/approve/:id", async (req, reply) => {
  const { executeOne } = await import("./actions.js");
  const id = (req.params as { id: string }).id;
  const pending = await store.getPending();
  const action = pending.find((a) => a.id === id && a.status === "pending");
  if (!action) return reply.code(404).send({ error: "no such pending action" });
  const result = await executeOne(action);
  await store.setPending(pending.filter((a) => a.id !== id));
  return { applied: result };
});

app.post("/api/dismiss/:id", async (req) => {
  const id = (req.params as { id: string }).id;
  await store.setPending((await store.getPending()).filter((a) => a.id !== id));
  return { dismissed: id };
});

app.get("/api/runs", async () => store.getRuns());

// ---- conversational agent (D15, W3): web surface — Slack threads reuse the same runConvo ----
app.get("/api/chat", async () => store.getConvo("web"));

app.post("/api/chat", async (req) => {
  const { runConvo } = await import("./agents/convo.js");
  const message = String((req.body as { message?: string })?.message ?? "").trim();
  if (!message) return { reply: "Say something first." };
  return runConvo("web", message, "web");
});

/** Start a fresh conversation. Without this, the only way to clear chat is a new account. */
app.delete("/api/chat", async () => {
  await store.setConvo("web", []);
  return { cleared: true };
});

/** Explicit confirm button on the dashboard — same effect as replying "do it". */
app.post("/api/chat/confirm", async () => {
  const { runConvo } = await import("./agents/convo.js");
  return runConvo("web", "do it", "web");
});

// Serve the built dashboard (web/dist) when present — one deployable service.
const dist = path.resolve(import.meta.dirname, "../../web/dist");
if (existsSync(dist)) {
  const { default: fastifyStatic } = await import("@fastify/static");
  await app.register(fastifyStatic, {
    root: dist,
    // Vite fingerprints every asset, so those can be cached forever. index.html must
    // never be cached: a stale copy points at asset hashes that no longer exist after a
    // deploy, and the page comes up blank.
    maxAge: "1y",
    immutable: true,
  });

  // index.html is served from two places (the static root and the SPA fallback below),
  // so pin the no-cache rule to what it is rather than where it came from.
  app.addHook("onSend", async (_req, reply, payload) => {
    if (String(reply.getHeader("content-type") ?? "").startsWith("text/html"))
      reply.header("cache-control", "no-cache");
    return payload;
  });

  // Anything with a file extension is an asset request, not a client-side route.
  const looksLikeAsset = (url: string) => /\.[a-zA-Z0-9]+$/.test(url.split("?")[0] ?? "");

  app.setNotFoundHandler((req, reply) => {
    // Handing index.html to a request for a missing .js is how a cache mismatch turns
    // into a silent white screen: the browser gets HTML where it expected a module,
    // refuses it on MIME grounds, and renders nothing. Fail honestly instead.
    if (req.method !== "GET" || req.url.startsWith("/api") || looksLikeAsset(req.url))
      return reply.code(404).send({ error: "not found" });
    return reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT ?? 8787);
app.listen({ port, host: "0.0.0.0" }).then(
  () => {
    console.log(`Cadence server on :${port}`);
    console.log(
      process.env.LANGSMITH_TRACING === "true" && process.env.LANGSMITH_API_KEY
        ? `LangSmith tracing on → project "${process.env.LANGSMITH_PROJECT ?? "default"}"`
        : "LangSmith tracing off (set LANGSMITH_TRACING=true + LANGSMITH_API_KEY)",
    );
  },
  (err) => {
    console.error(`Cadence failed to start on :${port}`, err);
    process.exit(1);
  },
);

// Slack conversational surface — fire-and-forget, never blocks the HTTP server
import("./slack-listener.js")
  .then((m) => m.startSlackListener())
  .catch((e) => console.error("Slack listener failed to start:", e));
