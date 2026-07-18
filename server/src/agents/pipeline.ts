/**
 * The 3-node agent pipeline (DECISIONS §5, §19): risk+cause → forecast → action.
 * Deterministic outputs are injected as facts — the LLM explains and drafts,
 * it never overrides the numbers. Timeline evidence is fetched per risky item
 * (the D19 enrichment tool) and handed to the risk node as tool results.
 * Grounded against LangChain docs for @langchain/langgraph 1.4.8 (StateSchema API).
 */
import { StateGraph, StateSchema, START, END, type GraphNode } from "@langchain/langgraph";
import { z } from "zod";
import { ActionPlanSchema, RiskCategory, RiskFinding, RiskFindingSchema, ScanResult, ScanResultSchema } from "../model.js";
import { getItemTimeline } from "../github.js";
import { currentLlm } from "../llm.js";

const warn = (node: string, e: unknown) =>
  console.warn(`[pipeline] ${node} node degraded:`, String((e as Error).message).slice(0, 300));

const State = new StateSchema({
  scan: ScanResultSchema,
  enrichedFindings: RiskFindingSchema.array().default([]),
  forecastNarrative: z.string().default(""),
  actionPlan: ActionPlanSchema.nullable().default(null),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const modelBrief = (scan: ScanResult) =>
  JSON.stringify(
    {
      sprint: scan.model.sprint,
      forecast: scan.forecast,
      reviewerLoad: scan.model.reviewerLoad,
      assigneeLoad: scan.model.assigneeLoad,
      items: scan.model.items.map(({ url, linkedIssueNumbers, ...rest }) => rest),
      deterministicFindings: scan.findings,
    },
    null,
    1,
  );

const key = (f: { itemNumber: number; category: RiskFinding["category"] }) => `${f.itemNumber}:${f.category}`;

/**
 * The findings a human would actually ask "why?" about — deduped and bounded. A scan
 * routinely produces ~17 findings, and asking one call to write prose for all of them
 * is what tipped the model into repeating itself: long structured generations are where
 * flash models degenerate. Low-severity findings explain themselves.
 */
function worthExplaining(findings: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  return findings
    .filter((f) => {
      if (f.severity === "low" || seen.has(key(f))) return false;
      seen.add(key(f));
      return true;
    })
    .slice(0, 8);
}

const EnrichmentSchema = z.object({
  itemNumber: z.number(),
  category: RiskCategory,
  rootCause: z.string(),
  recommendedAction: z.string(),
});

const riskNode: GraphNode<typeof State> = async (state) => {
  const { scan } = state;
  const targets = worthExplaining(scan.findings);
  // D19: fetch real timeline evidence for the distinct risky items (bounded to 4 calls)
  const timelines: Record<number, string[]> = {};
  for (const n of [...new Set(targets.map((f) => f.itemNumber))].slice(0, 4))
    timelines[n] = await getItemTimeline(n).catch(() => []);

  try {
    const llm = await currentLlm();
    const out = await llm
      .withStructuredOutput(z.object({ enrichments: EnrichmentSchema.array() }))
      .invoke([
        {
          role: "system",
          content:
            "You are the risk & root-cause analyst of Cadence, an Engineering Delivery Manager AI. " +
            "You receive risk findings that were computed deterministically, plus real GitHub timeline evidence. " +
            "For each finding you are given, return ONE enrichment naming its itemNumber and category, plus:\n" +
            "- rootCause: the specific underlying why, citing evidence (reviewer load, CI failures, staleness, board state).\n" +
            "- recommendedAction: one concrete next step naming the person and item.\n" +
            "Each must be a SINGLE short sentence. Never repeat a sentence or restate a point. " +
            "Return an enrichment only for the findings listed — do not invent items.",
        },
        {
          role: "user",
          content: `FINDINGS TO EXPLAIN:\n${JSON.stringify(targets, null, 1)}\n\nSPRINT MODEL:\n${modelBrief(scan)}\n\nTIMELINE EVIDENCE:\n${JSON.stringify(timelines, null, 1)}`,
        },
      ]);

    // Merge by key, so the model annotates the findings but can never drop, reorder or
    // invent one. That used to be a prompt instruction; it is now a property of the code.
    const byKey = new Map(out.enrichments.map((e) => [key(e), e]));
    return {
      enrichedFindings: scan.findings.map((f) => {
        const e = byKey.get(key(f));
        return e ? { ...f, rootCause: e.rootCause, recommendedAction: e.recommendedAction } : f;
      }),
    };
  } catch (e) {
    // Enrichment is additive: the deterministic findings are already complete and correct,
    // so a model that loops or truncates costs us the "why", not the whole run.
    warn("risk", e);
    return { enrichedFindings: scan.findings };
  }
};

const forecastNode: GraphNode<typeof State> = async (state) => {
  await sleep(2000); // free-tier RPM cushion
  const { scan } = state;
  try {
    const llm = await currentLlm();
    const out = await llm.withStructuredOutput(z.object({ narrative: z.string() })).invoke([
      {
        role: "system",
        content:
          "You are the delivery forecast analyst of Cadence. The completion likelihood, projected slip, and RAG status are computed deterministically — " +
          "you must NOT change them. Write a 2-4 sentence narrative explaining WHY the numbers are what they are, naming the specific items and bottlenecks driving the risk. " +
          "Never repeat a sentence.",
      },
      {
        role: "user",
        content: `FORECAST (fixed): ${JSON.stringify(scan.forecast)}\nFINDINGS: ${JSON.stringify(state.enrichedFindings)}\nSPRINT: ${JSON.stringify(scan.model.sprint)}`,
      },
    ]);
    return { forecastNarrative: out.narrative };
  } catch (e) {
    // The RAG numbers are deterministic and already on screen; only the prose is lost.
    warn("forecast", e);
    return { forecastNarrative: "" };
  }
};

const actionNode: GraphNode<typeof State> = async (state) => {
  await sleep(2000);
  const { scan } = state;
  try {
    const llm = await currentLlm();
    const out = await llm.withStructuredOutput(ActionPlanSchema).invoke([
    {
      role: "system",
      content:
        "You are the action agent of Cadence. Draft the closed-loop plan from the findings:\n" +
        '- githubActions: label risky items (label value must be exactly "at-risk" or "blocked") and write SHORT constructive comments on stalled/failing PRs (mention the root cause + recommended action; address the author by @login).\n' +
        "- slackReport: a crisp daily delivery report in Slack markdown: sprint health headline with RAG emoji (🔴🟡🟢), forecast numbers, top risks with root causes, recommended next actions. Max ~25 lines.\n" +
        "- ownerMessages: one short, friendly, specific message per distinct owner of at-risk work (githubLogin = their login), telling them exactly what to do next.\n" +
        "Do not invent items or people not present in the findings/model. At most one label + one comment per item.",
    },
    {
      role: "user",
      content: `FINDINGS: ${JSON.stringify(state.enrichedFindings)}\nFORECAST: ${JSON.stringify({ ...scan.forecast, narrative: state.forecastNarrative })}\nSPRINT MODEL: ${modelBrief(scan)}`,
      },
    ]);
    return { actionPlan: out };
  } catch (e) {
    // Last resort: report the deterministic truth rather than losing the run. We draft no
    // GitHub writes or DMs here — those need judgment we just failed to get.
    warn("action", e);
    return { actionPlan: { githubActions: [], ownerMessages: [], slackReport: deterministicReport(scan) } };
  }
};

/** A report built only from numbers we computed ourselves — always available. */
function deterministicReport(scan: ScanResult): string {
  const emoji = { red: "🔴", amber: "🟡", green: "🟢" }[scan.forecast.rag];
  const top = scan.findings
    .filter((f) => f.severity === "high")
    .slice(0, 5)
    .map((f) => `• #${f.itemNumber} — ${f.reason}`);
  return [
    `${emoji} *Sprint health: ${scan.forecast.rag.toUpperCase()}*`,
    `${scan.forecast.completionLikelihood}% likely to complete · ${scan.forecast.projectedSlipDays}d projected slip · ${scan.forecast.daysLeft}d left`,
    "",
    top.length ? "*Top risks*" : "No high-severity risks.",
    ...top,
    "",
    "_The analysis model was unavailable, so this report is the deterministic scan only._",
  ].join("\n");
}

const graph = new StateGraph(State)
  .addNode("risk", riskNode)
  .addNode("forecast", forecastNode)
  .addNode("action", actionNode)
  .addEdge(START, "risk")
  .addEdge("risk", "forecast")
  .addEdge("forecast", "action")
  .addEdge("action", END)
  .compile();

export interface PipelineResult {
  findings: z.infer<typeof RiskFindingSchema>[];
  forecastNarrative: string;
  actionPlan: z.infer<typeof ActionPlanSchema>;
}

export async function runPipeline(scan: ScanResult): Promise<PipelineResult> {
  const res = await graph.invoke({ scan });
  if (!res.actionPlan) throw new Error("Pipeline produced no action plan");
  return { findings: res.enrichedFindings, forecastNarrative: res.forecastNarrative, actionPlan: res.actionPlan };
}
