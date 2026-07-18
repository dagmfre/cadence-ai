/** Cadence server: scan + pipeline + closed-loop endpoints. */
import { config } from "dotenv";
config();
import Fastify from "fastify";
import path from "node:path";
import { existsSync } from "node:fs";
import { runScan } from "./scan.js";
import { store } from "./store.js";
import { registerWizard } from "./wizard.js";

const app = Fastify({ logger: { level: "warn" } });
registerWizard(app);

app.get("/api/scan", async () => {
  const scan = await runScan();
  await store.setLastScan(scan);
  return scan;
});

/** The full closed loop: scan → agents → act per autonomy mode → record run. */
app.post("/run-daily-scan", async (req) => {
  const { runPipeline } = await import("./agents/pipeline.js");
  const { executePlan } = await import("./actions.js");

  const scan = await runScan();
  await store.setLastScan(scan);
  const result = await runPipeline(scan);
  const applied = await executePlan(result.actionPlan);

  const run = {
    id: `run-${Date.now()}`,
    at: new Date().toISOString(),
    trigger: ((req.body as any)?.trigger ?? "manual") as "daily" | "manual",
    forecast: { ...scan.forecast, narrative: result.forecastNarrative },
    findingCount: result.findings.length,
    report: result.actionPlan.slackReport,
    applied,
  };
  await store.addRun(run);
  return { run, findings: result.findings, actionPlan: result.actionPlan };
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
  return runConvo("web", message);
});

/** Explicit confirm button on the dashboard — same effect as replying "do it". */
app.post("/api/chat/confirm", async () => {
  const { runConvo } = await import("./agents/convo.js");
  return runConvo("web", "do it");
});

// Serve the built dashboard (web/dist) when present — one deployable service.
const dist = path.resolve(import.meta.dirname, "../../web/dist");
if (existsSync(dist)) {
  const { default: fastifyStatic } = await import("@fastify/static");
  await app.register(fastifyStatic, { root: dist });
  app.setNotFoundHandler((req, reply) =>
    req.method === "GET" && !req.url.startsWith("/api") ? reply.sendFile("index.html") : reply.code(404).send({ error: "not found" }),
  );
}

const port = Number(process.env.PORT ?? 8787);
app.listen({ port, host: "0.0.0.0" }).then(() => console.log(`Cadence server on :${port}`));

// Slack conversational surface — fire-and-forget, never blocks the HTTP server
import("./slack-listener.js")
  .then((m) => m.startSlackListener())
  .catch((e) => console.error("Slack listener failed to start:", e));
